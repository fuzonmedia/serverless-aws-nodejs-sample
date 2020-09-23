const process = require('process');

const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');

function isStringVariableSet(variable) {
  if (variable !== undefined) {
    if (variable !== null) {
      if (variable.toString().trim() !== '') {
        return true; // If its not null or empty
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}

module.exports = {
  listSalesHistory: function(info, callback) {
    var saleshistory = {
       TableName: process.env.DYNAMODB_SALES_HISTORY_TABLE,
       IndexName: "primaryagent_email-status-index",
    };
    if (isStringVariableSet(info.agentemail)) {
      saleshistory['ExpressionAttributeNames'] = {
        '#agentidentifier': 'primaryagent_email'
      };
      saleshistory['ExpressionAttributeValues'] = {
        ':agentidentifier': info.agentemail
      };
      saleshistory['KeyConditionExpression'] = '#agentidentifier = :agentidentifier';
    };
    if (isStringVariableSet(info.status)) {
      saleshistory['ExpressionAttributeNames']['#status'] = 'status';
      saleshistory['ExpressionAttributeValues'][':status'] = info.status;
      saleshistory['KeyConditionExpression'] += ' and #status = :status';
    }
    var saleslist = [];
    dynamoDb.query(saleshistory, function(queryError, queryResult) {
      if (!queryError) {
        for (var i = 0; i < queryResult.Items.length; i++) {
          var salesEntry = queryResult.Items[i];
          saleslist.push(salesEntry);
        }
        callback({message: "Done", saleshistory: saleslist});
      } else {
        console.log(queryError);
        callback({message: "Error", error: queryError});
      }
    });
  }
};
