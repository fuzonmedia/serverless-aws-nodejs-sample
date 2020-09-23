const parambyname = require('./parambyname');

const debug = require('debug')('route::shortlist')

// Testing
const verifyTokenFunction = require('./verifytokenfunction');

const proposalUtilsLib = require('./proposalDatabaseUtils');
const userUtilsLib = require('./userDatabaseUtils');

var response = {
  message: "Access Denied"
}

const { use } = require('./util/http')
const auth = require('./middleware/auth')
const cors = require('./middleware/cors')

module.exports.get = use(
  cors(), auth({ usertype: 'seller' }),
  (req, res) => {
    const { shortlist = [] } = req.auth.user
    res.json({
      message: 'Done',
      shortlist,
    })
  }
)

module.exports.lib = function (info, callback) {
  if (info.entrypoint == "GET") {

  } else if (info.entrypoint == "POST") {
    if (!info.httpPOSTBody || info.httpPOSTBody.indexOf('token') < 0) {
      response["message"] = "Access Denied";
      response.shortlist = undefined;
      return callback(response);
    }
    const posttoken = parambyname("token", "http://localhost/?" + info.httpPOSTBody);
    verifyTokenFunction(posttoken, function (validTokenCB) {
      // Check token validity
      if (!validTokenCB.result || !validTokenCB.message || validTokenCB.result.usertype !== 'seller') {
        response["message"] = "Access Denied";
        response.shortlist = undefined;
        return callback(response);
      }
      if (info.httpPOSTBody.indexOf('proposalidentifier') >= 0) {
        proposalUtilsLib.listProposalRecord({
          proposalid: parambyname("proposalidentifier", "http://localhost/?" + info.httpPOSTBody)
        }, function (proposalCB) {

          debug(`listProposalRecord response:`)
          debug(proposalCB)

          response.message = proposalCB.message

          if (proposalCB.message == "Done") {

              proposals = proposalCB.result

              debug(`Proposals length: ${proposals.length}`)

              if (proposals.length == 1) {
                if (proposals[0]["ownerSellerId"] == validTokenCB["result"]["id"]) { // Must match the owner
                  console.log("Add Agent (" + proposals[0]["agentData"]["id"] + ") to whitelist");
                  var userContactWhitelist = []; // Set up whitelist variable
                  var myShortlist = []; // Setup shortlist
                  var updateShortlist = 1;
                  var updateWhitelist = 1;
                  if (validTokenCB["result"]["whitelistedcontacts"] !== undefined) userContactWhitelist = validTokenCB["result"]["whitelistedcontacts"];
                  if (validTokenCB["result"]["shortlist"] !== undefined) myShortlist = validTokenCB["result"]["shortlist"];
                  // Add agent to the whitelisted contact (proposalCB.result[0]["agentData"]["id"])
                  if (myShortlist.length > 0) {
                    for (var i = 0; i < myShortlist.length; i++) {
                      var shortlistEntry = myShortlist[i];
                      if (proposals[0]["agentData"]["id"] == shortlistEntry["id"]) {
                        updateShortlist = 0;
                      }
                    }
                  }
                  if (userContactWhitelist.length > 0) {
                    for (var i = 0; i < userContactWhitelist.length; i++) {
                      var whitelistEntry = userContactWhitelist[i];
                      if (proposals[0]["agentData"]["id"] == whitelistEntry) {
                        updateWhitelist = 0;
                      }
                    }
                  }
                  if (updateWhitelist == 1) {
                    userContactWhitelist.push(proposals[0]["agentData"]["id"]); // Add agent to my whitelist!
                  }
                  if (updateShortlist == 1) {
                    myShortlist.push({ id: proposals[0]["agentData"]["id"], 
                      email: proposals[0]["agentData"]["email"] }); // Add to shortlist
                  }
                  userUtilsLib.updateUserRecord({ emailaddress: validTokenCB["result"]["email"], changes: { whitelistedcontacts: userContactWhitelist, shortlist: myShortlist } }, function (updateUserCB) {
                    console.log("Update the user!");
                    if (updateUserCB.message !== "Done") {
                      console.log("User not updated");
                    } else {
                      console.log("User updated");
                      console.log(JSON.stringify(updateUserCB));
                    }
                  });
                  response.shortlist = undefined;
                  callback(response); // DONE:
                } else {
                  response.message = "You don't own this property";
                  response.shortlist = undefined;
                  callback(response);
                }
              } else {
                response.message = "Proposal doesn't exist or has already been accepted by an agent"
                response.shortlist = undefined;
                callback(response);
              }
          } else {
            response.shortlist = undefined;
            callback(response);
          }
        });
      } else {
        response.message = "Shortlist service requires the following parameters: token, proposalidentifier";
        response.shortlist = undefined;
        callback(response);
      }
    });
  } else if (info.entrypoint == "DELETE") { // Behaves similar to GET
    if (info.httpGETRequest !== undefined) {
      if (info.httpGETRequest !== null) {
        if (info.httpGETRequest.token !== undefined) {
          verifyTokenFunction(info.httpGETRequest.token, function (validTokenCB) {
            // Check token validity
            if (validTokenCB["result"] !== undefined && validTokenCB["message"] !== undefined) {
              if (validTokenCB["result"]["usertype"] !== undefined && validTokenCB["message"] == "Found") {
                // If found and usertype exists
                if (validTokenCB["result"]["usertype"] == "seller") { // Agents that the seller has shortlisted
                  if (info.httpGETRequest.agentid !== undefined) {
                    if (validTokenCB["result"]["shortlist"] !== undefined) {
                      if (validTokenCB["result"]["shortlist"].length > 0) {
                        var shortlist_deleted = 0;
                        var new_shortlist = [];
                        for (var i = 0; i < validTokenCB["result"]["shortlist"].length; i++) {
                          var shortlistRecord = validTokenCB["result"]["shortlist"][i];
                          if (shortlistRecord['id'] !== info.httpGETRequest.agentid) {
                            new_shortlist.push(shortlistRecord);
                          } else {
                            shortlist_deleted = 1;
                          }
                        }
                        if (shortlist_deleted == 1) {
                          userUtilsLib.updateUserRecordWithID({ useridentifier: validTokenCB["result"]["id"], changes: { shortlist: new_shortlist } }, function (updateShortlistCB) {
                            if (updateShortlistCB.message == "Done") {
                              response["message"] = "Done";
                            } else {
                              response["message"] = "An error occured updating the record";
                            }
                            response.shortlist = undefined;
                            callback(response);
                          });
                        } else {
                          response["message"] = "Agent ID not found";
                          response.shortlist = undefined;
                          callback(response);
                        }
                      } else {
                        response["message"] = "Shortlist is empty";
                        response.shortlist = undefined;
                        callback(response);
                      }
                    } else {
                      response["message"] = "Shortlist is empty";
                      response.shortlist = undefined;
                      callback(response);
                    }
                  } else {
                    response["message"] = "Requires agentid to remove shortlist";
                    response.shortlist = undefined;
                    callback(response);
                  }
                } else {
                  response["message"] = "Access Denied";
                  response.shortlist = undefined;
                  callback(response);
                }
              } else {
                response["message"] = "Access Denied";
                response.shortlist = undefined;
                callback(response);
              }
            } else {
              response["message"] = "Access Denied";
              response.shortlist = undefined;
              callback(response);
            }
          });
        } else {
          response["message"] = "Access Denied";
          response.shortlist = undefined;
          callback(response);
        }
      } else {
        response["message"] = "Access Denied";
        response.shortlist = undefined;
        callback(response);
      }
    } else {
      response["message"] = "Access Denied";
      response.shortlist = undefined;
      callback(response);
    }
  } else {
    response["message"] = "Invalid Method";
    response.shortlist = undefined;
    callback(response);
  }
}
