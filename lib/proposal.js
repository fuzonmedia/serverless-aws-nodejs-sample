const process = require('process');
const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');

const { map } = require('lodash')

var response = {
  message: "Not completed"
}

const verifyTokenFunction = require('./verifytokenfunction');

const proposalUtilsLib = require('./proposalDatabaseUtils');
const userUtilsLib = require('./userDatabaseUtils');
const storyUtilsLib = require('./storyDatabaseUtils');
const liststoryRecord = storyUtilsLib.liststoryRecord;

module.exports = function(info, callback) {
  response.message = "Access Denied";
  response.proposals = undefined;
  const prototypeProposalResponse = []; // This will be the response for list
  if (info.token !== undefined) {
    verifyTokenFunction(info.token, function(validTokenCB) {

      console.log(validTokenCB)

      // Check token validity
      if (validTokenCB["result"] && validTokenCB["message"] == "Found") {
        if (validTokenCB["result"]["usertype"] == "seller") {
          // Seller usertype.
          // Allowed to List, Accept and Reject
          if (info.entrypoint == "GET") { // List Proposals
            const shortlist = validTokenCB["result"].shortlist ? map(validTokenCB["result"].shortlist, 'id') : []
            proposalUtilsLib.listProposalRecord({
              ownerSellerId: validTokenCB["result"]["id"],
              query: info.httpGETRequest,
              shortlist,
            }, function(proposalCB) {
            response.message = proposalCB.message;
            if (proposalCB.proposals !== undefined) response.proposals = proposalCB.proposals;
            if (proposalCB.result !== undefined) response.proposals = proposalCB.result;
            callback(response);
          });
          } else if (info.entrypoint == "POST") {
            if (info.acceptproposal !== undefined) { // Accept or Reject
              if (info.proposalidentifier !== undefined) {
                proposalUtilsLib.listProposalRecord({proposalid: info.proposalidentifier}, function(proposalCB) {
                  if (proposalCB.result.length == 1) {
                    if (proposalCB.result[0]["ownerSellerId"] == validTokenCB["result"]["id"]) { // Must match the owner
                        if (info.acceptproposal == 1) {
                        proposalUtilsLib.updateProposalRecord({proposalid: info.proposalidentifier, changes: {status: "accepted"}}, function(updateProposalCB) {
                          var userContactWhitelist = []; // Set up whitelist  variable
                          var updateWhitelist = 1;
                          if (validTokenCB["result"]["whitelistedcontacts"] !== undefined) userContactWhitelist = validTokenCB["result"]["whitelistedcontacts"];
                          if (userContactWhitelist.length > 0) {
                            for (var i = 0; i < userContactWhitelist.length;    i++) {
                              var whitelistEntry = userContactWhitelist[i];
                              if (proposalCB.result[0]["agentData"]["id"] == whitelistEntry) { // If theres a whitelist then dont add
                                updateWhitelist = 0;
                              }
                            }
                          }
                          // Add agent to the whitelisted contact (proposalCB.result[0]["agentData"]["id"])
                          if (updateWhitelist == 1) {
                            userContactWhitelist.push(proposalCB.result[0]["agentData"]["id"]); // Add to whitelist!
                          }
                          userUtilsLib.updateUserRecord({emailaddress: validTokenCB["result"]["email"], changes: {whitelistedcontacts: userContactWhitelist}}, function(updateUserCB) {
                            if (updateUserCB.message !== "Done") {
                              console.error("User not updated");
                            }
                          });
                          console.log("Send all the proposals that was declined relating to this property (" + proposalCB.result[0]["storyData"]["propertyidentifier"] + ") an email");
                          console.log("At this point we should clean up all the proposals relating to this propertyidentifier (" + proposalCB.result[0]["storyData"]["propertyidentifier"] + ") too");
                          response.message = updateProposalCB.message;
                          if (updateProposalCB.message !== "Done") {
                            response.result = updateProposalCB.result;
                          }
                          callback(response);
                        });
                      } else if (info.acceptproposal == 0) {
                        proposalUtilsLib.updateProposalRecord({proposalid: info.proposalidentifier, changes: {status: "declined"}}, function(updateProposalCB) {
                          response.message = updateProposalCB.message;
                          if (updateProposalCB.message !== "Done") {
                            response.result = updateProposalCB.result;
                          }
                          callback(response);
                        });
                      } else {
                        response.message = "acceptproposal must be 0 (decline) or 1 (accept)";
                        callback(response);
                      };
                    } else {
                      response.message = "Proposal is not owned by logged in user";
                      callback(response);
                    }
                  } else {
                    response.message = "Cant find the proposal to accept/reject (Already been done)"
                    callback(response);
                  }
                });
              } else {
                response.message = "In order to accept or decline a proposal you need to specify the identifier";
                response.proposals = undefined;
                callback(response);
              } // End: Accept or reject
            } else { // No Proposal Identifier
              response.message = "Required Parameters: proposalidentifier, acceptproposal";
              response.proposals = undefined;
              callback(response);
            }
          } else { // Invalid Method
            response.message = "Invalid Method";
            response.proposals = undefined;
            callback(response);
          }
        } else if (validTokenCB["result"]["usertype"] == "agent" && validTokenCB["result"]["agentstatus"] == "active") {
          // Usertype is agent and t must be active
          // Agents can create or list proposals
          if (info.entrypoint == "POST") { // Create Only
            if (info.storyidentifier && info.commission && info.answers) {
              if (parseFloat(info.commission) > 0 && parseFloat(info.commission) < 100) { // Commission must be a valid percentage
                liststoryRecord({storyid: info.storyidentifier}, function(cb) {
                  if (cb.message == "Done") {
                    if (cb.result.length == 1) { // Theres a matching story to create a proposal
                      var proposalInputParameters = {
                        propertyOwnerId: cb.result[0]['ownerSellerId'],
                        answers: info.answers,
                        commission: info.commission,
                        storyidentifier: cb.result[0]['id'],
                        storydata: cb.result[0],
                        agent: {
                          id: validTokenCB.result.id,
                          firstname: validTokenCB.result.firstname,
                          lastname: validTokenCB.result.lastname
                        }
                      };
                      if (info.proposalnote) {
                        proposalInputParameters.proposalnote = info.proposalnote;
                      }
                      proposalUtilsLib.createProposalRecord(proposalInputParameters, function(pucb) {
                        response.message = "Done";
                        if (pucb.message !== 'Done') {
                          response.message = pucb.message;
                          console.error(pucb.message);
                        }
                        if (pucb.result !== undefined) response.result = pucb.result;
                        callback(response);
                      });
                    } else {
                      response.message = "Invalid storyidentifier";
                      callback(response);
                    }
                  } else {
                    response.message = cb.message
                    callback(response);
                  }
                });
              } else {
                response.message = "Commission must be a valid percentage (between 0 and 100)";
                response.proposals = undefined;
                callback(response);
              }
            } else {
              response.message = "In order to create a proposal you need the following at the minimum: token, storyidentifier, commission, answers";
              response.proposals = undefined;
              callback(response);
            }
          } else if (info.entrypoint == "GET") { // Agent user GET Request
            proposalUtilsLib.listProposalRecord({agentid: validTokenCB["result"]["id"]}, function(proposalCB) {
              response.message = proposalCB.message;
              if (proposalCB.proposals !== undefined) response.proposals = proposalCB.proposals;
              if (proposalCB.result !== undefined) response.proposals = proposalCB.result;
              callback(response);
            });
          } else { // Invalid Method
            response.message = "Invalid method";
            response.proposals = undefined;
            callback(response);
          }
        } else if (validTokenCB["result"]["usertype"] == "admin") { // Admin usertype (Can list only)
          if (info.entrypoint == "GET") {
            response.message = "Done";
            response.proposals = prototypeProposalResponse;
            callback(response);
          } else {
            response.message = "Access Denied";
            response.proposals = undefined;
            callback(response);
          }
        } else { // Invalid user type
          response.message = "Access Denied";
          response.proposals = undefined;
          callback(response);
        }
      } else { // Invalid Message
        console.log("token not found")
        response.message = "Access Denied";
        response.proposals = undefined;
        callback(response);
      }
    });
  } else {
    console.log('Token not supplied')
    response.message = "Access Denied";
    response.proposals = undefined;
    callback(response);
  }
}
