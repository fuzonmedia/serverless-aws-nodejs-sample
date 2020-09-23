const process = require('process');
const parambyname = require('./parambyname');

const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');

const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';
const validShortlistIdentifier = "valididentifier";
const invalidShortlistIdentifier = "invalididentifier";
const messagesStub = [];

const verifyTokenFunction = require('./verifytokenfunction');
const messageUtilsLib = require('./messagesUtils');

var response = {
  message: "Access Denied"
}
module.exports = function(info, callback) {
  if (info.entrypoint == "GET") {
    if (info.httpGETRequest != undefined) {
      if (info.httpGETRequest != null) {
        if (info.httpGETRequest.token != undefined) {
          if (info.httpGETRequest.token != null) {
            verifyTokenFunction(info.httpGETRequest.token, function(validTokenCB) {
              // Check token Validity
              if (validTokenCB["result"] !== undefined && validTokenCB["message"] !== undefined) {
                if (validTokenCB["result"]["usertype"] !== undefined && validTokenCB["message"] == "Found") {
                  // If found and usertype exists
                  if (validTokenCB["result"]["usertype"] == "seller" || validTokenCB["result"]["usertype"] == "agent") { // Either Seller or agent can list messagesStub
                    messageUtilsLib.listMessages({recipientid: validTokenCB["result"]["id"]}, function(messageInboxCB) {
                      response.message = messageInboxCB.message;
                      response.messages = messageInboxCB.messages;
                      response.canmessage = undefined;
                      response.delivered = undefined;
                      if (messageInboxCB.error !== undefined) response.error = messageInboxCB.error
                      callback(response);
                    });
                  } else { // Otherwise access denied
                    response.message = "Access Denied";
                    response.messages = undefined;
                    callback(response);
                  }
                } else { // Invalid token
                  response.message = "Access Denied";
                  response.messages = undefined;
                  callback(response);
                }
              } else { // Invalid response
                response.message = "Access Denied";
                response.messages = undefined;
                callback(response);
              }
            });
          } else {
            response.message = "Access Denied";
            response.messages = undefined;
            callback(response);
          }
        } else {
          response.message = "Access Denied";
          response.messages = undefined;
          callback(response);
        }
      } else {
        response.message = "Access Denied";
        response.messages = undefined;
        callback(response);
      }
    } else {
      response.message = "Access Denied";
      response.messages = undefined;
      callback(response);
    }
  } else if (info.entrypoint == "POST") {
    if (info.httpPOSTBody !== undefined) {
      if (info.httpPOSTBody !== null) {
        if (info.httpPOSTBody.indexOf('token') >= 0) {
          verifyTokenFunction(parambyname("token", "http://localhost/?" + info.httpPOSTBody), function(validTokenCB) {
            // Check token Validity
            if (validTokenCB["result"] !== undefined && validTokenCB["message"] !== undefined) {
              if (validTokenCB["result"]["usertype"] !== undefined && validTokenCB["message"] == "Found") {
                // If found and usertype exists
                if (validTokenCB["result"]["usertype"] == "seller" || validTokenCB["result"]["usertype"] == "agent") { // Either Seller or agent can list messagesStub
                  // This will need to be replaced with real logic soon
                  if (info.httpPOSTBody.indexOf('recipientid') >= 0 && info.httpPOSTBody.indexOf('message') >= 0) {
                    const recipientid = parambyname("recipientid", "http://localhost/?" + info.httpPOSTBody); // recipientid
                    const message = parambyname("message", "http://localhost/?" + info.httpPOSTBody); // message
                    const senderid = validTokenCB["result"]["id"];
                    // We will see if t can contact or not
                    if (recipientid == validShortlistIdentifier) {
                      response.message = "Done";
                      response.messages = messagesStub;
                      callback(response);
                    } else if (validTokenCB["result"]["usertype"] == "seller") { // Seller can always contact
                      response.message = "Done";
                      response.canmessage = true;
                      // Send the message!
                      messageUtilsLib.messageUser({recipientid: recipientid, senderid: senderid, message: message}, function(sentmessagecb) {
                        response.message = sentmessagecb.message;
                        response.delivered = sentmessagecb.delivered;
                        response.messages = undefined;
                        callback(response);
                      });
                    } else { // Otherwise lets just check the agent if t can contact or not
                      if (validTokenCB["result"]["usertype"] == "agent") {
                        if (validTokenCB["result"]["agentstatus"] !== undefined) {
                          if (validTokenCB["result"]["agentstatus"] == "active") {
                            // Send the message!
                            messageUtilsLib.messageUser({recipientid: recipientid, senderid: senderid, message: message}, function(sentmessagecb) {
                              response.message = sentmessagecb.message;
                              response.delivered = sentmessagecb.delivered;
                              response.messages = undefined;
                              if (sentmessagecb.error !== undefined) response.error = sentmessagecb.error;
                              callback(response);
                            });
                          } else {
                            response.message = "Only active agents may send messages. Please contact support to resolve this.";
                            response.canmessage = false;
                            response.delivered = false;
                            callback(response);
                          }
                        } else {
                          response.message = "Only active agents may send messages. Please contact support to resolve this.";
                          response.canmessage = false;
                          response.delivered = false;
                          callback(response);
                        }
                      } else {
                        response.message = "Only agents and sellers may use the messaging functionality";
                        response.canmessage = false;
                        response.delivered = false;
                        callback(response);
                      }
                    }
                  } else {
                    response.message = "Message API requires the following: recipientid, message";
                    response.messages = undefined;
                    callback(response);
                  }
                } else { // No access for other user types
                  response.message = "Access Denied";
                  response.messages = undefined;
                  callback(response);
                }
              } else { // Invalid token
                response.message = "Access Denied";
                response.messages = undefined;
                callback(response);
              }
            } else { // Invalid Response
              response.message = "Access Denied";
              response.messages = undefined;
              callback(response);
            }
          });
        } else {
          response.message = "Access Denied";
          response.messages = undefined;
          callback(response);
        }
      } else {
        response.message = "Access Denied";
        response.messages = undefined;
        callback(response);
      }
    } else {
      response.message = "Access Denied";
      response.messages = undefined;
      callback(response);
    }
  } else {
    response.message = "Invalid method";
    response.messages = undefined;
    callback(response);
  }
}
