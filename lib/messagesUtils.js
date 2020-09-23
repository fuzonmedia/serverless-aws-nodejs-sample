const process = require('process');

const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');

const userDatabaseUtils = require('./userDatabaseUtils'); // To check if we can send to the user

const async = require('async');

function compareDate(objA, objB) {
    if (objA.createdAt !== undefined && objB.createdAt !== undefined) {
        if (objA.createdAt < objB.createdAt) {
            return -1;
        } else if (objA.createdAt > objB.createdAt) {
            return 1;
        } else {
            return 0;
        }
    } else {
        // Error
        console.log("createdAt doesn't exist in either comparison objects");
        return;
    }
}

module.exports = {
  readMessage: function(info, callback) {
    if (info.messageidentifier !== undefined) {
      var updateparams = {
        TableName: process.env.DYNAMODB_MESSAGES_TABLE,
        Key: {
          id: info.messageidentifier
        },
        ExpressionAttributeNames: {
          '#read': 'read'
        },
        ExpressionAttributeValues: {
          ':read': true
        },
        UpdateExpression: 'SET #read = :read',
        ReturnValues: 'ALL_NEW',
      };
      dynamoDb.update(updateparams, function(updatedbError, updatedbResult) {
        if (!updatedbError) {
          callback({message: "Done"});
        } else {
          callback({message: "Error", error: updatedbError});
        }
      });
    } else {
      callback({message: "Requires 'messageidentifier' to mark a message as read"});
    }
  },
  listMessages: function(info, callback) {
    if (info.recipientid !== undefined) { // List for a certain recipientid
      const readstatus = info.readstatus || false;
      const queryformessages = {
         TableName: process.env.DYNAMODB_MESSAGES_TABLE,
         ExpressionAttributeNames: {
           '#recipientid': 'recipientid',
           '#read': 'read'
         },
         ExpressionAttributeValues: {
           ':recipientid': info.recipientid,
           ':read': readstatus
         },
         FilterExpression: '#recipientid = :recipientid and #read = :read'
      };
      // Perform query
      dynamoDb.scan(queryformessages, function(err, res) {
        if (!err) {
          if (res.Count > 0) {
            var messages = [];
            var messageInbox = [];
            var messagesProcessed = 0;
            for (var i = 0; i < res.Items.length; i++) {
              var message = res.Items[i];
              var to_insert_into_row = {
                "sender": {
                  "id": message['sender']['id'],
                  "email": message['sender']['email']
                },
                "createdAt": message['createdAt'],
                "read": message["read"],
                "messageId": message["id"],
                "content": message["message"]
              };
              if (message['sender']['agentlicense'] !== undefined) to_insert_into_row['sender']['agentlicense'] = message['sender']['agentlicense'];
              if (message['sender']['agentstatus'] !== undefined) to_insert_into_row['sender']['agentstatus'] = message['sender']['agentstatus'];
              if (message['sender']['firstname'] !== undefined) to_insert_into_row['sender']['firstname'] = message['sender']['firstname'];
              if (message['sender']['lastname'] !== undefined) to_insert_into_row['sender']['lastname'] = message['sender']['lastname'];
              if (message['sender']['profilephoto'] !== undefined) to_insert_into_row['sender']['profilephoto'] = message['sender']['profilephoto'];

              messages.push(to_insert_into_row);
            }
            // Group by recipient
            messages.sort(compareDate).reverse().reduce(function(reduced, obj) {
              if (messageInbox[obj.sender["email"]] == undefined) {
                messageInbox[obj.sender["email"]] = [obj];
              } else {
                messageInbox[obj.sender["email"]].push(obj);
              }
              reduced = messageInbox;
              return reduced;
            }, {});
            callback({message: "Done", messages: messages});
          } else {
            callback({message: "Done", messages: messages});
          }
        } else {
          callback({message: "Error", messages:[], error: err});
        }
      });
    } else {
      callback({message: "Requires recipientid to list all the messages received"})
    }
  },
  messageUser: function(info, callback) {
    if (info.recipientid !== undefined && info.senderid !== undefined && info.message !== undefined) {
      userDatabaseUtils.getUserRecord({useridentifier: info.senderid}, function(usercb) {
        if (usercb.message == "Done") {
          if (usercb.result !== undefined) {
            var MessageRecordToInsert = {
              id: uuid.v1(),
              recipientid: info.recipientid,
              sender: usercb.result,
              read: false,
              message: info.message,
              createdAt: new Date().getTime()
            };
            console.log("Sending....");
            console.log(MessageRecordToInsert);
            const msgdbparams = {
                TableName: process.env.DYNAMODB_MESSAGES_TABLE,
                Item: MessageRecordToInsert
            };
            // do the actual database insert
            // TODO: Add flood protection
            dynamoDb.put(msgdbparams, (error, result) => {
              if (!error) {
                callback({message: "Done", delivered: true});
              } else {
                callback({message: "Done", delivered: false, error: error});
              }
            });
          } else {
            callback({message: "Can't get sender information", delivered: false});
          }
        } else {
          callback({message: "Can't get sender information", delivered: false});
        }
      });
    } else {
      callback({message: "Please specify a message, recipientid and senderid", delivered: false});
    }
  },
  canMessageUser: function(info, callback) {
    if (info.recipientid !== undefined && info.senderid !== undefined) {
      userDatabaseUtils.getUserRecord({useridentifier: info.recipientid}, function(usercb) {
        if (usercb.message == "Done") {
          if (usercb.result !== undefined) {
            var canMessage = false;
            if (usercb.result.whitelistedcontacts !== undefined) { // Message can be delivered
              // Lets see if we have a whitelisted contact there
              for (var i = 0; i < usercb.result.whitelistedcontacts.length; i++) {
                var whitelistedContact = usercb.result.whitelistedcontacts[i];
                if (whitelistedContact == info.senderid) { // Sender is whitelisted in the recipient record
                  canMessage = true;
                }
              }
              callback({message: "Done", canmessage: canMessage, delivered: false});
            } else { // Message can't be delivered
              callback({message: "Done", canmessage: false, delivered: false});
            }
          } else {
            callback({message: "Can't access user table properly (or structure has changed)"});
          }
        } else {
          callback({message: usercb.message});
        }
      });
    } else {
      callback({message: "Please specify a User identifier"});
    }
  }
}
