const AWS = require('aws-sdk');
AWS.config.update({region:'ap-southeast-2'});
const bluebird = require('bluebird')
const dynamoDb = bluebird.promisifyAll(new AWS.DynamoDB.DocumentClient());
const debug = require('debug')('verifytokenfunction')

// Placeholder Tokens to be provided
const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';

module.exports = function(token, callback = null) {

  debug("Search for token: " + token)

  const queryforvalidtoken = {
     TableName: "agentsUsers",
     ExpressionAttributeNames: {
       '#tokentext': 'token'
     },
     ExpressionAttributeValues: {
       ':thelogintoken': token
     },
     FilterExpression: '#tokentext = :thelogintoken'
  };

  return dynamoDb.scanAsync(queryforvalidtoken).then(result => {
    let response
      if (result.Count == 1) {
        const userFound = result.Items[0];
        if (callback) {
          return callback({message: "Found", result: userFound, usertype: userFound.usertype})
        }
        return typeof userFound !== 'undefined' ? userFound : null
      } else {
        if (callback) {
          return callback({message: "Not Found"})
        }
        return null
      }
      return callback ? callback(response) : response
  }).catch(err => {
    if (callback) {
      return callback({message: "Error", error: err})
    }
    throw err
  })
};
