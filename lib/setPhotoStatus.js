const process = require('process');
const parambyname = require('./parambyname');

const AWS = require('aws-sdk');
AWS.config.update({region:'ap-southeast-2'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');
const crypto = require('crypto'); // for signing policies
const btoa = require('btoa');
const aws_secret = process.env.AWS_S3_UPLOAD_SECRET;

const verifyTokenFunction = require('./verifytokenfunction');

const userUtilsLib = require('./userDatabaseUtils');

var updatestoryDetails = require('./storyDatabaseUtils').updatePropertyDetails;
var getstory = require('./storyDatabaseUtils').getstory;


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

var response = {
  message: "Access Denied"
}

const updatePhotoStatus = function (info, callback) {
  var photoStatusResult = {
    message: "Invalid parameters"
  };
  if (isStringVariableSet(info.photoidentifier) && isStringVariableSet(info.objectidentifier) && isStringVariableSet(info.photostatus) && isStringVariableSet(info.photofile)) {
    const queryforphotoexistance = {
       TableName: process.env.DYNAMODB_PHOTOS_TABLE,
       KeyConditionExpression: 'id = :identifier',
       ExpressionAttributeValues: {':identifier': info.photoidentifier}
    };
    var ExpressionAttributeValuesObject = {
      ':updatedAt': new Date().getTime(),
      ':photostatus': info.photostatus,
      ':photofile': info.photofile
    };
    var updateExpressingString = 'SET updatedAt = :updatedAt, #statustext = :photostatus, photofile = :photofile';
    if (process.env.IMAGES_ORIGIN_URL !== undefined) {
      // Set Resized URLs to an object
      ExpressionAttributeValuesObject[':resizedUrls'] = {
        'square80px': process.env.IMAGES_ORIGIN_URL.toString() + '/' + info.objectidentifier.toString() + '/' + info.photoidentifier + '/resized80-' + info.photofile,
        'square200px': process.env.IMAGES_ORIGIN_URL.toString() + '/' + info.objectidentifier.toString() + '/' + info.photoidentifier + '/resized200-' + info.photofile,
        '300px': process.env.IMAGES_ORIGIN_URL.toString() + '/' + info.objectidentifier.toString() + '/' + info.photoidentifier + '/resized300-' + info.photofile,
        '450px': process.env.IMAGES_ORIGIN_URL.toString() + '/' + info.objectidentifier.toString() + '/' + info.photoidentifier + '/resized450-' + info.photofile,
        '600px': process.env.IMAGES_ORIGIN_URL.toString() + '/' + info.objectidentifier.toString() + '/' + info.photoidentifier + '/resized600-' + info.photofile
      };
      ExpressionAttributeValuesObject[':photostatus'] = 'completed';
      updateExpressingString = updateExpressingString + ', resizedUrls = :resizedUrls';
    }
    const updateparams = {
      TableName: queryforphotoexistance.TableName,
      Key: {
        id: info.photoidentifier
      },
      ExpressionAttributeNames: {
        '#statustext': 'photostatus'
      },
      ExpressionAttributeValues: ExpressionAttributeValuesObject,
      UpdateExpression: updateExpressingString,
      ReturnValues: 'ALL_NEW',
    };
    dynamoDb.query(queryforphotoexistance, function(queryError, queryResult) {
      if (!queryError) {
        if (queryResult.Count > 0) {
          console.log(queryResult.Items);
          var photoItem = queryResult.Items[0];
          if (photoItem["type"] == "property") { // if its a property photo
            if (photoItem["storyid"] == info.objectidentifier) { // Property Identifier needs to match before we update
              dynamoDb.update(updateparams, function(updatedbError, updatedbResult) {
                console.log(updateparams);
                console.log(updatedbResult);
                if (!updatedbError) {
                  photoStatusResult.message = "Done";
                  callback(photoStatusResult);
                } else {
                  photoStatusResult.message = "Can't update story photo (" + updatedbError.message + "). For support purposes, please quote RequestId: " + updatedbError.requestId + ". ";
                  callback(photoStatusResult);
                };
              });
            } else {
              photoStatusResult.message = "Object Identifier does not match entry in the database - not updating";
              callback(photoStatusResult);
            }
          } else if (photoItem["type"] == "profilephoto") {
            if (photoItem["useridentifier"] == info.objectidentifier) { // Object identifier needs to match before we update
              userUtilsLib.updateUserRecordWithID({useridentifier: info.objectidentifier, changes: {profilephotos: ExpressionAttributeValuesObject[':resizedUrls'], profilephoto: process.env.IMAGES_ORIGIN_URL.toString() + '/' + info.objectidentifier.toString() + '/' + info.photoidentifier + '/resized200-' + info.photofile}}, function(updateuserrecordcb) {
                console.log("Updated user record");
                console.log(updateuserrecordcb);
              });
              dynamoDb.update(updateparams, function(updatedbError, updatedbResult) {
                if (!updatedbError) {
                  photoStatusResult.message = "Done";
                  callback(photoStatusResult);
                } else {
                  photoStatusResult.message = "Can't update user database (" + updatedbError.message + "). For support purposes, please quote RequestId: " + updatedbError.requestId + ". ";
                  callback(photoStatusResult);
                };
              });
            } else {
              photoStatusResult.message = "Object Identifier does not match entry in the database - not updating";
              callback(photoStatusResult);
            }
          } else {
            callback({message: "Can't find the photo type in the database"});
          }
        } else {
          // Photo identifier doesnt exist doesn't exist
          callback({message: "Can't find photo identifier"});
        };
      } else {
        photoStatusResult['message'] = "Error while trying to query photos table";
        callback(photoStatusResult);
      }
    });
  } else {
    photoStatusResult['message'] = "Invalid Parameters";
    callback(photoStatusResult);
  }
}

module.exports = function(info, callback) {
  if (info.entrypoint == "GET") {
    if (info.httpGETRequest != undefined) {
      if (info.httpGETRequest != null) {
        if (info.httpGETRequest.token !== undefined) {
          if (info.httpGETRequest.token !== null) {
            const token = info.httpGETRequest.token;
            verifyTokenFunction(token, function(validTokenCB) {
              // Check token Validity
              if (validTokenCB["result"] !== undefined && validTokenCB["message"] !== undefined) {
                if (validTokenCB["result"]["usertype"] !== undefined && validTokenCB["message"] == "Found") {
                  // If found and usertype exists
                  if (validTokenCB["result"]["usertype"] == "seller" || validTokenCB["result"]["usertype"] == "agent") { // Must be a seller or admin
                    if (info.httpGETRequest.objectidentifier !== undefined && info.httpGETRequest.photoidentifier !== undefined && info.httpGETRequest.photostatus !== undefined) {
                      updatePhotoStatus({photoidentifier: info.httpGETRequest.photoidentifier, objectidentifier: info.httpGETRequest.objectidentifier, photostatus: info.httpGETRequest.photostatus, photofile: info.httpGETRequest.photofile}, function(updatedPhotocb) {
                        response.message = updatedPhotocb.message
                        callback(response);
                      });
                    } else {
                      response.message = "Require parameter: objectidentifier, photoidentifier, photostatus, photofile";
                      callback(response);
                    }
                  } else {
                    callback(response);
                  }
                }
              } else {
                callback(response);
              }
            });
          } else {
            callback(response);
          }
        } else {
          callback(response);
        }
      } else {
        callback(response);
      }
    } else {
      callback(response);
    }
  } else {
    callback(response);
  }
}
