const process = require('process');

const AWS = require('aws-sdk');
AWS.config.update({region:'ap-southeast-2'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');

const crypto = require('crypto'); // for signing policies
const btoa = require('btoa');
const aws_secret = process.env.AWS_S3_UPLOAD_SECRET;

const verifyTokenFunction = require('./verifytokenfunction');

const storyUtilsLib = require('./storyDatabaseUtils');

var response = {
  message: "Access Denied"
}

module.exports = function(info, callback) {
  if (info.token !== undefined) {
    verifyTokenFunction(info.token, function(validTokenCB) {
      if (validTokenCB.result && validTokenCB.message == "Found") {
        if (info.storyid) { //story id must be provided
          if (validTokenCB.result.usertype == "seller") {
            storyUtilsLib.getstory(info.storyid, function(res) {
              if (res.message == "Done") {
                //if seller, t must be owner of supplied story
                if (res.result.ownerSellerId == validTokenCB.result.id) {
                  insertPhoto();
                } else {
                  response.message = "Access Denied";
                  callback(response);
                }
              } else {
                response.message = "Error retrieving story";
                callback(response);
              }
            });
          } else if (validTokenCB.result.usertype == "admin") {
            insertPhoto();
          } else {
            response.message = "Access Denied";
            callback(response);
          }
        } else {
          response.message = "story identifier required";
          callback(response);
        }
      } else {
        response.message = "Access Denied";
        callback(response);
      }
    });
  } else {
    response.message = "Access Denied";
    callback(response);
  }

  function insertPhoto() {
    // Generate cors policy
    var corspolicy = {
           'expiration': ISODateString(new Date().addHours(1)),
           'conditions': [
             {'acl': 'public-read'},
             {'bucket': process.env.AWS_S3_BUCKET},
             ["starts-with", "$Content-Type", ""],
             ["starts-with","$key",""],
             ["content-length-range", 0, 524288000]
           ]
    };
    // Create metadata in photos database against "propertyidentifier"
    var photoRecordToInsert = {
      id: uuid.v1(),
      storyid: info.storyid,
      photostatus: "unprocessed",
      type: "property",
      createdAt: new Date().getTime(),
      updatedAt: new Date().getTime()
    };
    const dbparams = {
        TableName: process.env.DYNAMODB_PHOTOS_TABLE,
        Item: photoRecordToInsert
    };
    // Insert to photo database
    dynamoDb.put(dbparams, (error, result) => {
      if (!error) {
        response.message = "Done";
        response.s3info = {
          storyid: info.storyid,
          corspolicy: corspolicy,
          photoMetadataId: photoRecordToInsert["id"],
          AWSAccessKeyId: process.env.AWS_S3_UPLOAD_KEY,
          signature: crypto.createHmac('sha1', aws_secret).update(btoa(JSON.stringify(corspolicy))).digest().toString('base64'), // Sign the base64 encoded cors policy string
          bucket: process.env.AWS_S3_BUCKET,
          bucketurl: "//" + process.env.AWS_S3_BUCKET.toString() + ".s3.amazonaws.com"
        }
        callback(response);
      } else {
        response.message = "Error inserting into database ('" + error.message + "'). Please quote request identifier '" + error.requestId + "' if you wish to report this";
        callback(response);
      }
    });
  }
};

//helper functions
function ISODateString(d){
     function pad(n){return n<10 ? '0'+n : n}
     return d.getUTCFullYear()+'-'
          + pad(d.getUTCMonth()+1)+'-'
          + pad(d.getUTCDate())+'T'
          + pad(d.getUTCHours())+':'
          + pad(d.getUTCMinutes())+':'
          + pad(d.getUTCSeconds())+'Z'
}

Date.prototype.addHours = function(h) {
   this.setTime(this.getTime() + (h*60*60*1000));
   return this;
}
