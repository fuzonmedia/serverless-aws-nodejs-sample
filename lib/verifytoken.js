const process = require('process');
const parambyname = require('./parambyname');
const crypto = require('crypto');
const verifyTokenFunction = require('./verifytokenfunction');

const uuid = require('uuid');

var response = {
  message: "Invalid Parameters"
}


module.exports = function(info, callback) {
  if (info.entrypoint == "GET") {
    if (info.httpGETRequest != undefined) {
      if (info.httpGETRequest != null) {
        if (info.httpGETRequest.token != undefined) {
          if (info.httpGETRequest.token != null) {
            const token = info.httpGETRequest.token;
            verifyTokenFunction(token, function(verifytokenCB) {
              if (verifytokenCB.message == "Found") {
                response["message"] = "Done";
                if (verifytokenCB["result"] !== undefined) {
                  if (verifytokenCB["result"]["id"] !== undefined) response["identifier"] = verifytokenCB["result"]["id"];                  
                  if (verifytokenCB["result"]["usertype"] !== undefined) response["usertype"] = verifytokenCB["result"]["usertype"];
                  if (verifytokenCB["result"]["firstname"] !== undefined) response["firstname"] = verifytokenCB["result"]["firstname"];
                  if (verifytokenCB["result"]["lastname"] !== undefined) response["lastname"] = verifytokenCB["result"]["lastname"];
                  if (verifytokenCB["result"]["profilephoto"] !== undefined) response["profilephoto"] = verifytokenCB["result"]["profilephoto"];
                }

              } else {
                response["message"] = "Access Denied";
              }
              callback(response);
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
