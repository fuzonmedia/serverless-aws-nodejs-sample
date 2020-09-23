const process = require('process');
const parambyname = require('./parambyname');
const crypto = require('crypto');

const AWS = require('aws-sdk');
AWS.config.update({region:'ap-southeast-2'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');

// Tokens to be provided
const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';

const reviewsUtilsLib = require('./reviewsDatabaseUtils');

var response = {
  message: "Access Denied"
}
module.exports = function(info, callback) {
  if (info.entrypoint == "GET") {
    if (info.httpGETRequest != undefined) {
      if (info.httpGETRequest != null) {
        if (info.httpGETRequest.emailtoken != undefined) {
          if (info.httpGETRequest.emailtoken != null && info.httpGETRequest.email) {
            const emailtoken = info.httpGETRequest.emailtoken;
            const userEmailAddress = info.httpGETRequest.email;
            // placeholder
            if (emailtoken == "3169c67942abd3769067bdf2fd4eecd1") {
              // placeholder seller
              response.message = "Done";
              response.token = validSellerUser;
              callback(response);
            } else if (emailtoken == "52404b4a82a1bf2a8d1053d3843d016c") {
              response.message = "Done";
              response.token = validAgentUser;
              callback(response);
            } else {
              const dbquery = {
                 TableName: "agentsUsers",
                 KeyConditionExpression: 'email = :email',
                 ExpressionAttributeValues: {':email': userEmailAddress}
              };
              response.message = "Processing";
              response.token = "novalid";
              dynamoDb.query(dbquery, function(queryError, queryResult) {
                if (!queryError) {
                  if (queryResult.Count == 1) {
                    const foundUser = queryResult.Items[0];
                    if (foundUser.emailToken == emailtoken) {
                      const timestamp = new Date().getTime();
                      const loginToken = crypto.createHash('md5').update("loggedin=1&email=" + info.email + "&timestamp=" + timestamp).digest('hex')
                      const updateparams = {
                        TableName: dbquery.TableName,
                        Key: {
                          email: userEmailAddress
                        },
                        ExpressionAttributeNames: {
                          '#tokentext': 'token',
                        },
                        ExpressionAttributeValues: {
                          ':tokentext': loginToken,
                          ':updatedAt': timestamp,
                          ':emailVerified': true,
                          ':agentstatus': 'active',
                        },
                        UpdateExpression: 'SET #tokentext = :tokentext, updatedAt = :updatedAt, emailVerified = :emailVerified, agentstatus = :agentstatus',
                        ReturnValues: 'ALL_NEW',
                      };
                      dynamoDb.update(updateparams, function(updatedbError, updatedbResult) {
                        if (!updatedbError) {
                          response.message = "Done";
                          response.token = loginToken;
                          if (foundUser['id'] !== undefined) response['identifier'] = foundUser['id'];
                          if (foundUser.firstname !== undefined) response.firstname = foundUser.firstname;
                          if (foundUser.lastname !== undefined) response.lastname = foundUser.lastname;
                          if (foundUser.usertype !== undefined) response.usertype = foundUser.usertype;

                          if (foundUser.firstname !== undefined) {
                            console.log("Firstname is set")
                          }
                          if (response.usertype == "agent") {
                            reviewsUtilsLib.associateExistingReviews(foundUser.email, foundUser.id);
                          }
                          console.log("Response");
                          console.log(response);
                          callback(response);
                        } else {
                          response.message = "Can't update user database (" + queryError.message + "). For support purposes, please quote RequestId: " + queryError.requestId + ". ";
                          response.token = undefined;
                        }
                        callback(response);
                      });
                    } else {
                      response.message = "Access Denied";
                      response.token = undefined;
                      callback(response);
                    }
                  } else {
                    response.message = "Access Denied";
                    response.token = undefined;
                    callback(response);
                  }
                } else {
                  response.message = "Cant find users table (" + queryError.message + "). For support purposes, please quote RequestId: " + queryError.requestId + ". ";
                  response.token = undefined;
                  response.debug = {
                    query: dbquery
                  }
                  callback(response);
                }
              });
            }
          } else {
            response.message = "Access Denied";
            response.token = undefined;
            callback(response);
          }
        } else {
          response.message = "Access Denied";
          response.token = undefined;
          callback(response);
        }
      } else {
        response.message = "Access Denied";
        response.token = undefined;
        callback(response);
      }
    } else {
      response.message = "Access Denied";
      response.token = undefined;
      callback(response);
    }
  } else {
    // Invalid Entry point
    response.message = "Invalid Method";
    response.token = undefined;
    callback(response);
  }
}
