const process = require('process');
const parambyname = require('./parambyname');

const AWS = require('aws-sdk');
AWS.config.update({region:'ap-southeast-2'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');
const crypto = require('crypto'); // for signing policies
const btoa = require('btoa');
const aws_secret = process.env.AWS_S3_UPLOAD_SECRET;

const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';

const verifyTokenFunction = require('./verifytokenfunction');
const propertyUtilsLib = require('./propertyDatabaseUtils');

var updatePropertyDetails = propertyUtilsLib.updatePropertyDetails;
var fetchPrimaryPropertyInfo = propertyUtilsLib.fetchPropertyInfo;
var fetchPropertyPhotos = propertyUtilsLib.fetchPropertyPhotos;
var fetchPropertyFeatures = propertyUtilsLib.fetchPropertyFeatures;
var fetchPropertySalesHistory = propertyUtilsLib.fetchPropertySalesHistory;
var fetchNearbyPOIFeatures = propertyUtilsLib.fetchNearbyPOIFeatures;
var addFeatureToProperty = propertyUtilsLib.addFeatureToProperty;

var response = {
  message: "Access Denied"
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
                  if (validTokenCB["result"]["usertype"] == "seller") {
                    // Must be a valid seller
                    if (token == validSellerUser) { // Use fake property if token is the fake token
                      // BEGIN: Fake property
                      response.message = "Done";
                      response.property = {
                        identifier: "e4b2ee90-f286-11e6-b1fb-0f6cede30981",
                        owner: "22482900-f287-11e6-af82-53952f585629",
                        propertytype: "apartment",
                        address: {
                          addressline1: "Apartment #12",
                          addressline2: "123 Pitt St.",
                          city: "Sydney",
                          postcode: "2000",
                          state: "NSW"
                        },
                        photos: [],
                        history: [],
                        bedrooms: 1,
                        bathrooms: 0,
                        parkingspots: 1,
                        propertysize: 50,
                        propertyrenovated: false,
                        propertyfeatures: [],
                        propertynearby: []
                      } // END: Fake seller
                      response.s3info = undefined;
                      callback(response);
                    } else {
                      // Real data
                      if (validTokenCB["result"]["id"] !== undefined) { // check if theres an id from the response
                        if (validTokenCB["result"]["id"] !== null) { // check if theres an id from the response
                          var propertyInfoParams = {};
                          // Lets check if theres a propertyidentifier in the GET
                          if (info.httpGETRequest.propertyidentifier !== undefined) {
                            propertyInfoParams["propertyidentifier"] = info.httpGETRequest.propertyidentifier
                          } else {
                            propertyInfoParams["ownerSellerId"] = validTokenCB["result"]["id"];
                          }
                          fetchPrimaryPropertyInfo(propertyInfoParams, function(cb) { // Search for primary property owned by owner
                            if (cb.message == "Yes") { // If we find a matching property?
                              response.message = "Done";
                              if (cb["property"] !== undefined) {
                                if (cb["property"] !== null) {
                                  response.property = {
                                    identifier: cb["property"]["id"],
                                    owner: validTokenCB["result"]["id"],
                                    propertytype: cb["property"]["propertytype"],
                                    address: {
                                      addressline1: cb["property"]["propertyaddress1"],
                                      postcode: cb["property"]["propertypostcode"]
                                    },
                                    status: cb["property"]["propertystatus"],
                                    photos: undefined,
                                    history: undefined,
                                    bedrooms: undefined,
                                    bathrooms: undefined,
                                    parkingspots: undefined,
                                    propertysize: undefined,
                                    condition: undefined,
                                    ownershipstyle: undefined,
                                    renovated: undefined,
                                    features: undefined,
                                    nearby: undefined,
                                    isPrimaryProperty: cb["property"]["primary"],
                                    createDate: cb["property"]["createdAt"],
                                    lastUpdated: cb["property"]["updatedAt"]
                                  };
                                  // Optional Address details
                                  if (cb["property"]["propertyaddress2"] !== undefined) {
                                    if (cb["property"]["propertyaddress2"].toString().trim() != '') {
                                      response.property["address"]["addressline2"] = cb["property"]["propertyaddress2"];
                                    } else {
                                      response.property["address"]["addressline2"] = undefined;
                                    }
                                  }
                                  if (cb["property"]["propertycity"] !== undefined) response.property["address"]["city"] = cb["property"]["propertycity"];
                                  if (cb["property"]["propertystate"] !== undefined) response.property["address"]["state"] = cb["property"]["propertystate"];
                                  // Optional Features
                                  if (cb["property"]["propertybedrooms"] !== undefined) response.property["bedrooms"] = cb["property"]["propertybedrooms"];
                                  if (cb["property"]["propertybathrooms"] !== undefined) response.property["bathrooms"] = cb["property"]["propertybathrooms"];
                                  // Other Features
                                  if (cb["property"]["propertyrenovated"] !== undefined) response.property["propertysize"] = cb["property"]["propertysize"];
                                  if (cb["property"]["propertyparkingspots"] !== undefined) response.property["parkingspots"] = cb["property"]["propertyparkingspots"];
                                  if (cb["property"]["propertysize"] !== undefined) response.property["propertysize"] = cb["property"]["propertysize"];
                                  if (cb["property"]["propertyrenovated"] !== undefined) {
                                    response.property["renovated"] = cb["property"]["propertyrenovated"];
                                  } else {
                                    response.property["renovated"] = false;
                                  }
                                  // New fields: condition and ownershipstyle
                                  if (cb["property"]["propertyownershipstyle"] !== undefined) response.property["ownershipstyle"] = cb["property"]["propertyownershipstyle"];
                                  if (cb["property"]["propertycondition"] !== undefined) response.property["condition"] = cb["property"]["propertycondition"];

                                  // Fetch property photos from photos table
                                  fetchPropertyPhotos({propertyidentifier: cb["property"]["id"]}, function(photocb) {
                                    if (photocb.message == "Yes") { // Show tthe photos if it exists
                                      if (photocb.photos !== undefined) {
                                        response.property["photos"] = photocb.photos;
                                      } else {
                                        response.property["photos"] = [];
                                      }
                                    } else { // No photos
                                      response.property["photos"] = [];
                                    }
                                    // Do other transactions under this callback
                                    // property features
                                    fetchPropertyFeatures({propertyidentifier: cb["property"]["id"]}, function(featurescb) {
                                      if (featurescb.message == "Yes") {
                                        if (featurescb.features !== undefined) { // Show features if it exists
                                          response.property["features"] = featurescb.features;
                                        } else {
                                          response.property["features"] = [];
                                        }
                                      } else {
                                        response.property["features"] = [];
                                      }
                                      // Fetch sales history
                                      fetchPropertySalesHistory({propertyidentifier: cb["property"]["id"]}, function(salescb) {
                                        if (salescb.message == "Yes") {
                                          if (salescb.sales !== undefined) {
                                            response.property["history"] = salescb.sales;
                                          } else {
                                            response.property["history"] = [];
                                          }
                                        } else {
                                          response.property["history"] = [];
                                        }
                                        // Fetch Nearby points of interest
                                        fetchNearbyPOIFeatures({propertyidentifier: cb["property"]["id"]}, function(nearbycb) {
                                          if (nearbycb.message == "Yes") {
                                            if (nearbycb.nearby !== undefined) {
                                              response.property["nearby"] = nearbycb.nearby;
                                            }
                                          } else {
                                            response.property["nearby"] = [];
                                          }
                                          response.s3info = undefined;
                                          callback(response);
                                        });
                                      });
                                    });
                                  }); // 4 levels of callback hell
                                  // End: Fetch property photos (and other callbacks)
                                } else {
                                  response.message = "Invalid response returned from database";
                                  response.property = undefined;
                                  response.s3info = undefined;
                                  callback(response);
                                }
                              } else {
                                response.message = "Invalid response returned from database";
                                response.property = undefined;
                                response.s3info = undefined;
                                callback(response);
                              }
                            } else { // Otherwise no matching property
                              response.message = "Can't find property owned by user identifier " + validTokenCB["result"]["id"].toString();
                              response.property = undefined;
                              response.s3info = undefined;
                              callback(response);
                            }
                          });
                        } else { // Invalid id in database
                          response.message = "Access Denied";
                          response.property = undefined;
                          response.s3info = undefined;
                          callback(response);
                        }
                      } else { // Invalid Id in database
                        response.message = "Access Denied";
                        response.property = undefined;
                        response.s3info = undefined;
                        callback(response);
                      }
                    }
                  } else if (validTokenCB["result"]["usertype"] == "agent" || validTokenCB["result"]["usertype"] == "admin") { // Admin or Agent should be able to fetch any properties if the identifier is known
                    if (info.httpGETRequest.propertyidentifier !== undefined) {
                      if (info.httpGETRequest.propertyidentifier !== null) {
                        // BEGIN: Fetch property
                        fetchPrimaryPropertyInfo({propertyidentifier: info.httpGETRequest.propertyidentifier}, function(cb) { // Search for primary property owned by owner
                          if (cb.message == "Yes") { // If we find a matching property?
                            response.message = "Done";
                            if (cb["property"] !== undefined) {
                              if (cb["property"] !== null) {
                                response.property = {
                                  identifier: cb["property"]["id"],
                                  owner: validTokenCB["result"]["id"],
                                  propertytype: cb["property"]["propertytype"],
                                  address: {
                                    addressline1: cb["property"]["propertyaddress1"],
                                    postcode: cb["property"]["propertypostcode"]
                                  },
                                  status: cb["property"]["propertystatus"],
                                  photos: undefined,
                                  history: undefined,
                                  bedrooms: undefined,
                                  bathrooms: undefined,
                                  parkingspots: undefined,
                                  propertysize: undefined,
                                  condition: undefined,
                                  ownershipstyle: undefined,
                                  renovated: undefined,
                                  features: undefined,
                                  nearby: undefined,
                                  isPrimaryProperty: cb["property"]["primary"],
                                  createDate: cb["property"]["createdAt"],
                                  lastUpdated: cb["property"]["updatedAt"]
                                };
                                // Optional Address details
                                if (cb["property"]["propertyaddress2"] !== undefined) {
                                  if (cb["property"]["propertyaddress2"].toString().trim() != '') {
                                    response.property["address"]["addressline2"] = cb["property"]["propertyaddress2"];
                                  } else {
                                    response.property["address"]["addressline2"] = undefined;
                                  }
                                }
                                if (cb["property"]["propertycity"] !== undefined) response.property["address"]["city"] = cb["property"]["propertycity"];
                                if (cb["property"]["propertystate"] !== undefined) response.property["address"]["state"] = cb["property"]["propertystate"];
                                // Optional Features
                                if (cb["property"]["propertybedrooms"] !== undefined) response.property["bedrooms"] = cb["property"]["propertybedrooms"];
                                if (cb["property"]["propertybathrooms"] !== undefined) response.property["bathrooms"] = cb["property"]["propertybathrooms"];
                                // Other Features
                                if (cb["property"]["propertyrenovated"] !== undefined) response.property["propertysize"] = cb["property"]["propertysize"];
                                if (cb["property"]["propertyparkingspots"] !== undefined) response.property["parkingspots"] = cb["property"]["propertyparkingspots"];
                                if (cb["property"]["propertysize"] !== undefined) response.property["propertysize"] = cb["property"]["propertysize"];
                                if (cb["property"]["propertyrenovated"] !== undefined) {
                                  response.property["renovated"] = cb["property"]["propertyrenovated"];
                                } else {
                                  response.property["renovated"] = false;
                                }
                                // New fields: condition and ownershipstyle
                                if (cb["property"]["propertyownershipstyle"] !== undefined) response.property["ownershipstyle"] = cb["property"]["propertyownershipstyle"];
                                if (cb["property"]["propertycondition"] !== undefined) response.property["condition"] = cb["property"]["propertycondition"];

                                // Fetch property photos from photos table
                                fetchPropertyPhotos({propertyidentifier: cb["property"]["id"]}, function(photocb) {
                                  if (photocb.message == "Yes") { // Show tthe photos if it exists
                                    if (photocb.photos !== undefined) {
                                      response.property["photos"] = photocb.photos;
                                    } else {
                                      response.property["photos"] = [];
                                    }
                                  } else { // No photos
                                    response.property["photos"] = [];
                                  }
                                  // Do other transactions under this callback
                                  // property features
                                  fetchPropertyFeatures({propertyidentifier: cb["property"]["id"]}, function(featurescb) {
                                    if (featurescb.message == "Yes") {
                                      if (featurescb.features !== undefined) { // Show features if it exists
                                        response.property["features"] = featurescb.features;
                                      } else {
                                        response.property["features"] = [];
                                      }
                                    } else {
                                      response.property["features"] = [];
                                    }
                                    // Fetch sales history
                                    fetchPropertySalesHistory({propertyidentifier: cb["property"]["id"]}, function(salescb) {
                                      if (salescb.message == "Yes") {
                                        if (salescb.sales !== undefined) {
                                          response.property["history"] = salescb.sales;
                                        } else {
                                          response.property["history"] = [];
                                        }
                                      } else {
                                        response.property["history"] = [];
                                      }
                                      // Fetch Nearby points of interest
                                      fetchNearbyPOIFeatures({propertyidentifier: cb["property"]["id"]}, function(nearbycb) {
                                        if (nearbycb.message == "Yes") {
                                          if (nearbycb.nearby !== undefined) {
                                            response.property["nearby"] = nearbycb.nearby;
                                          }
                                        } else {
                                          response.property["nearby"] = [];
                                        }
                                        response.s3info = undefined;
                                        callback(response);
                                      });
                                    });
                                  });
                                }); // 4 levels of callback hell
                                // End: Fetch property photos (and other callbacks)
                              } else {
                                response.message = "Invalid response returned from database";
                                response.property = undefined;
                                response.s3info = undefined;
                                callback(response);
                              }
                            } else {
                              response.message = "Invalid response returned from database";
                              response.property = undefined;
                              response.s3info = undefined;
                              callback(response);
                            }
                          } else { // Otherwise no matching property
                            response.message = "Can't find property owned by user identifier " + validTokenCB["result"]["id"].toString();
                            response.property = undefined;
                            response.s3info = undefined;
                            callback(response);
                          }
                        });
                        // END: Fetch Property
                      } else {
                        response.message = "Requires: propertyidentifier";
                        response.property = undefined;
                        response.s3info = undefined;
                        callback(response);
                      }
                    } else {
                      response.message = "Requires: propertyidentifier";
                      response.property = undefined;
                      response.s3info = undefined;
                      callback(response);
                    }
                  } else { // No other usertypes supported
                    response.message = "Access Denied";
                    response.property = undefined;
                    response.s3info = undefined;
                    callback(response);
                  }
                } else {
                  response.message = "Access Denied";
                  response.property = undefined;
                  response.s3info = undefined;
                  callback(response);
                }
              } else {
                response.message = "Access Denied";
                response.property = undefined;
                response.s3info = undefined;
                callback(response);
              }
            });
          } else { // No Token
            response.message = "Access Denied";
            response.property = undefined;
            response.s3info = undefined;
            callback(response);
          }
        } else { // No Token
          response.message = "Access Denied";
          response.property = undefined;
          response.s3info = undefined;
          callback(response);
        }
      } else { // No GET parameters
        response.message = "Access Denied";
        response.property = undefined;
        response.s3info = undefined;
        callback(response);
      }
    } else { // No Get Parameters
      response.message = "Access Denied";
      response.property = undefined;
      response.s3info = undefined;
      callback(response);
    }
  } else if (info.entrypoint == "POST") { // HTTP POST
    // HTTP POST
    if (info.httpPOSTBody !== undefined) {
      if (info.httpPOSTBody !== null) {
        if (info.httpPOSTBody.indexOf('token') >= 0) {
          const posttoken = parambyname("token", "http://localhost/?" + info.httpPOSTBody);
          verifyTokenFunction(posttoken, function(validTokenCB) {
            if (validTokenCB["result"] !== undefined && validTokenCB["message"] !== undefined) {
              if (validTokenCB["message"] == "Found") {
                if (validTokenCB["result"]["usertype"] !== undefined) {
                  if (validTokenCB["result"]["usertype"] == "seller") {
                    // Valid seller user only
                    if (info.httpPOSTBody.indexOf('propertyidentifier') >= 0 && info.httpPOSTBody.indexOf('changetype') >= 0) {
                      var propertyidentifier = parambyname("propertyidentifier", "http://localhost/?" + info.httpPOSTBody);
                      var changetype = parambyname("changetype", "http://localhost/?" + info.httpPOSTBody);
                      // Sample
                      if (propertyidentifier == "e4b2ee90-f286-11e6-b1fb-0f6cede30981") { // Sample id
                        response.message = "Done";
                        response.property = undefined;
                        response.s3info = undefined;
                        callback(response);
                      } else {
                        // Lets do an actual lookup if not a test record
                        var loggedInOwnerId = '';
                        if (validTokenCB["result"]["id"] !== undefined) {
                          loggedInOwnerId = validTokenCB["result"]["id"];
                        } else {
                          loggedInOwnerId = 'validsellerid';
                        }
                        var updatePropertyDetailsParams = {
                          propertyidentifier: propertyidentifier,
                          ownerSellerId: loggedInOwnerId.toString(),
                          changes: {
                            update: "this"
                          }
                        };
                        if (changetype == "property") { // Update property info
                          if (info.httpPOSTBody.indexOf('propertytype') >= 0) updatePropertyDetailsParams["changes"]["propertytype"] = parambyname("propertytype", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertystatus') >= 0) updatePropertyDetailsParams["changes"]["propertystatus"] = parambyname("propertystatus", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertyaddress1') >= 0) updatePropertyDetailsParams["changes"]["propertyaddress1"] = parambyname("propertyaddress1", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertyaddress2') >= 0) updatePropertyDetailsParams["changes"]["propertyaddress2"] = parambyname("propertyaddress2", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertycity') >= 0) updatePropertyDetailsParams["changes"]["propertycity"] = parambyname("propertycity", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertypostcode') >= 0) updatePropertyDetailsParams["changes"]["propertypostcode"] = parambyname("propertypostcode", "http://localhost/?" + info.httpPOSTBody);
                          // Other features
                          if (info.httpPOSTBody.indexOf('propertysize') >= 0) updatePropertyDetailsParams["changes"]["propertysize"] = parseInt(parambyname("propertysize", "http://localhost/?" + info.httpPOSTBody));
                          if (info.httpPOSTBody.indexOf('propertybedrooms') >= 0) updatePropertyDetailsParams["changes"]["propertybedrooms"] = parseInt(parambyname("propertybedrooms", "http://localhost/?" + info.httpPOSTBody));
                          if (info.httpPOSTBody.indexOf('propertybathrooms') >= 0) updatePropertyDetailsParams["changes"]["propertybathrooms"] = parseInt(parambyname("propertybathrooms", "http://localhost/?" + info.httpPOSTBody));
                          if (info.httpPOSTBody.indexOf('propertyparkingspots') >= 0) updatePropertyDetailsParams["changes"]["propertyparkingspots"] = parseInt(parambyname("propertyparkingspots", "http://localhost/?" + info.httpPOSTBody));
                          if (info.httpPOSTBody.indexOf('propertyrenovated') >= 0) {
                            if (parambyname("propertyrenovated", "http://localhost/?" + info.httpPOSTBody) == "true") {
                              updatePropertyDetailsParams["changes"]["propertyrenovated"] = true;
                            } else {
                              updatePropertyDetailsParams["changes"]["propertyrenovated"] = false;
                            }
                          }
                          // New fields for update
                          if (info.httpPOSTBody.indexOf('propertyownershipstyle') >= 0) updatePropertyDetailsParams["changes"]["propertyownershipstyle"] = parambyname("propertyownershipstyle", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertycondition') >= 0) updatePropertyDetailsParams["changes"]["propertycondition"] = parambyname("propertycondition", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertyvalueoption') >= 0) updatePropertyDetailsParams["changes"]["propertyvalueoption"] = parambyname("propertyvalueoption", "http://localhost/?" + info.httpPOSTBody);

                          updatePropertyDetails(updatePropertyDetailsParams, function(updatePropertyCB) {
                            if (updatePropertyCB.message == "Yes") {
                              response.message = "Done";
                              response.property = updatePropertyCB["record"];
                              response.s3info = undefined;
                              callback(response);
                            } else {
                              response.message = updatePropertyCB.error;
                              response.property = undefined;
                              response.s3info = undefined;
                              callback(response);
                            }
                          });
                        } else if (changetype == "addfeature") { //Add features
                          var addFeatureParams = {
                            propertyidentifier: propertyidentifier
                          };
                          if (info.httpPOSTBody.indexOf('featurename') >= 0) addFeatureParams["featurename"] = parambyname("featurename", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('featurecomment') >= 0) addFeatureParams["featurecomment"] = parambyname("featurecomment", "http://localhost/?" + info.httpPOSTBody);

                          addFeatureToProperty(addFeatureParams, function(addfeaturecb) {
                            if (addfeaturecb.message == "Yes") {
                              response.message = "Done";
                              response.property = undefined;
                              response.s3info = undefined;
                              callback(response);
                            } else {
                              response.message = addfeaturecb.error;
                              response.property = undefined;
                              response.s3info = undefined;
                              callback(response);
                            }
                          });
                        } else if (changetype == "addphoto") { // Prepare for photo upload
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
                            ownerPropertyId: propertyidentifier,
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
                              response.property = undefined;
                              response.s3info = {
                                propertyidentifier: propertyidentifier,
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
                              response.property = undefined;
                              response.s3info = undefined;
                            }
                          });
                        } else {
                          response.message = "Requires: propertyidentifier and changetype (either 'property' or 'addphoto')";
                          response.property = undefined;
                          response.s3info = undefined;
                          callback(response);
                        }
                      } // Check property identifier
                    } else {
                      response.message = "Requires: propertyidentifier and changetype (either 'property' or 'addphoto')";
                      response.property = undefined;
                      response.s3info = undefined;
                      callback(response);
                    }
                  } else if (validTokenCB["result"]["usertype"] == "admin") { // User type Admin: Can create property
                    if (validTokenCB["result"]["id"] !== undefined) {
                      if (info.httpPOSTBody.indexOf('action') >= 0) {
                        var action = parambyname("action", "http://localhost/?" + info.httpPOSTBody);
                        if (action == "create") {
                          var adminIdentifier = validTokenCB["result"]["id"];
                          var createPropertyInput = {
                            ownerSellerId: adminIdentifier
                          };
                          if (info.httpPOSTBody.indexOf('propertytype') >= 0) createPropertyInput["propertytype"] = parambyname("propertytype", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertyaddress1') >= 0) createPropertyInput["propertyaddress1"] = parambyname("propertyaddress1", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertyaddress2') >= 0) createPropertyInput["propertyaddress2"] = parambyname("propertyaddress2", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertypostcode') >= 0) createPropertyInput["propertypostcode"] = parambyname("propertypostcode", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertystate') >= 0) createPropertyInput["propertystate"] = parambyname("propertystate", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertycity') >= 0) createPropertyInput["propertycity"] = parambyname("propertycity", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertyownershipstyle') >= 0) createPropertyInput["propertyownershipstyle"] = parambyname("propertyownershipstyle", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertycondition') >= 0) createPropertyInput["propertycondition"] = parambyname("propertycondition", "http://localhost/?" + info.httpPOSTBody);
                          if (info.httpPOSTBody.indexOf('propertyvalueoption') >= 0) createPropertyInput["propertyvalueoption"] = parambyname("propertyvalueoption", "http://localhost/?" + info.httpPOSTBody);

                          propertyUtilsLib.createProperty(createPropertyInput, function(createPropertyCB) {
                            response.message = createPropertyCB.message;
                            response.property = createPropertyCB.property;
                            response.s3info = undefined;
                            callback(response);
                          });
                        } else if (action == "update") {
                          if (info.httpPOSTBody.indexOf('propertyidentifier') >= 0 && info.httpPOSTBody.indexOf('changetype') >= 0) {
                            var propertyidentifier = parambyname("propertyidentifier", "http://localhost/?" + info.httpPOSTBody);
                            var changetype = parambyname("changetype", "http://localhost/?" + info.httpPOSTBody);
                            if (changetype == "property") { // Admin: Update property info
                              var adminUpdatePropertyDetailsParams = {
                                propertyidentifier: propertyidentifier,
                                ownerSellerId: "adminupdate",
                                changes: {
                                  update: "this"
                                }
                              };
                              if (info.httpPOSTBody.indexOf('propertytype') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertytype"] = parambyname("propertytype", "http://localhost/?" + info.httpPOSTBody);
                              if (info.httpPOSTBody.indexOf('propertystatus') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertystatus"] = parambyname("propertystatus", "http://localhost/?" + info.httpPOSTBody);
                              if (info.httpPOSTBody.indexOf('propertyaddress1') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertyaddress1"] = parambyname("propertyaddress1", "http://localhost/?" + info.httpPOSTBody);
                              if (info.httpPOSTBody.indexOf('propertyaddress2') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertyaddress2"] = parambyname("propertyaddress2", "http://localhost/?" + info.httpPOSTBody);
                              if (info.httpPOSTBody.indexOf('propertycity') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertycity"] = parambyname("propertycity", "http://localhost/?" + info.httpPOSTBody);
                              if (info.httpPOSTBody.indexOf('propertypostcode') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertypostcode"] = parambyname("propertypostcode", "http://localhost/?" + info.httpPOSTBody);
                              // Other features
                              if (info.httpPOSTBody.indexOf('propertysize') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertysize"] = parseInt(parambyname("propertysize", "http://localhost/?" + info.httpPOSTBody));
                              if (info.httpPOSTBody.indexOf('propertybedrooms') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertybedrooms"] = parseInt(parambyname("propertybedrooms", "http://localhost/?" + info.httpPOSTBody));
                              if (info.httpPOSTBody.indexOf('propertybathrooms') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertybathrooms"] = parseInt(parambyname("propertybathrooms", "http://localhost/?" + info.httpPOSTBody));
                              if (info.httpPOSTBody.indexOf('propertyparkingspots') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertyparkingspots"] = parseInt(parambyname("propertyparkingspots", "http://localhost/?" + info.httpPOSTBody));
                              if (info.httpPOSTBody.indexOf('propertyrenovated') >= 0) {
                                if (parambyname("propertyrenovated", "http://localhost/?" + info.httpPOSTBody) == "true") {
                                  adminUpdatePropertyDetailsParams["changes"]["propertyrenovated"] = true;
                                } else {
                                  adminUpdatePropertyDetailsParams["changes"]["propertyrenovated"] = false;
                                }
                              }

                              if (info.httpPOSTBody.indexOf('propertyownershipstyle') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertyownershipstyle"] = parambyname("propertyownershipstyle", "http://localhost/?" + info.httpPOSTBody);
                              if (info.httpPOSTBody.indexOf('propertycondition') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertycondition"] = parambyname("propertycondition", "http://localhost/?" + info.httpPOSTBody);
                              if (info.httpPOSTBody.indexOf('propertyvalueoption') >= 0) adminUpdatePropertyDetailsParams["changes"]["propertyvalueoption"] = parambyname("propertyvalueoption", "http://localhost/?" + info.httpPOSTBody);

                              updatePropertyDetails(adminUpdatePropertyDetailsParams, function(updatePropertyCB) {
                                if (updatePropertyCB.message == "Yes") {
                                  response.message = "Done";
                                  response.property = updatePropertyCB["record"];
                                  response.s3info = undefined;
                                  callback(response);
                                } else {
                                  response.message = updatePropertyCB.error;
                                  response.property = undefined;
                                  response.s3info = undefined;
                                  callback(response);
                                }
                              });
                            } else if (changetype == "addphoto") { // Admin: Add photo
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
                              var AdminInsertPhotodbparams = {
                                  TableName: process.env.DYNAMODB_PHOTOS_TABLE,
                                  Item: {
                                    id: uuid.v1(),
                                    ownerPropertyId: propertyidentifier,
                                    photostatus: "unprocessed",
                                    type: "property",
                                    createdAt: new Date().getTime(),
                                    updatedAt: new Date().getTime()
                                  }
                              };
                              // Insert to photo database
                              dynamoDb.put(AdminInsertPhotodbparams, (error, result) => {
                                if (!error) {
                                  response.message = "Done";
                                  response.property = undefined;
                                  response.s3info = {
                                    propertyidentifier: propertyidentifier,
                                    corspolicy: corspolicy,
                                    photoMetadataId: AdminInsertPhotodbparams["Item"]["id"],
                                    AWSAccessKeyId: process.env.AWS_S3_UPLOAD_KEY,
                                    signature: crypto.createHmac('sha1', aws_secret).update(btoa(JSON.stringify(corspolicy))).digest().toString('base64'), // Sign the base64 encoded cors policy string
                                    bucket: process.env.AWS_S3_BUCKET,
                                    bucketurl: "http://" + process.env.AWS_S3_BUCKET.toString() + ".s3.amazonaws.com"
                                  }
                                  callback(response);
                                } else {
                                  response.message = "Error inserting into database ('" + error.message + "'). Please quote request identifier '" + error.requestId + "' if you wish to report this";
                                  response.property = undefined;
                                  response.s3info = undefined;
                                }
                              });
                            } else {
                              response.message = "Invalid changetype. Allowed - 'property', 'addphoto'";
                              response.property = undefined;
                              response.s3info = undefined;
                              callback(response);
                            }
                          } else {
                            response.message = "Action update requires 'propertyidentifier' and 'changetype'";
                            response.property = undefined;
                            response.s3info = undefined;
                            callback(response);
                          }
                        } else {
                          response.message = "Invalid Action. Allowed - 'create'";
                          response.property = undefined;
                          response.s3info = undefined;
                          callback(response);
                        }
                      } else {
                        response.message = "Invalid Action. Allowed - 'create'";
                        response.property = undefined;
                        response.s3info = undefined;
                        callback(response);
                      }
                    } else {
                      response.message = "Access Denied";
                      response.property = undefined;
                      response.s3info = undefined;
                      callback(response);
                    }
                  } else { // END: Usertype check
                    response.message = "Access Denied";
                    response.property = undefined;
                    response.s3info = undefined;
                    callback(response);
                  }
                } else {
                  response.message = "Access Denied";
                  response.property = undefined;
                  response.s3info = undefined;
                  callback(response);
                }
              } else { // Present access denied cause not found
                response.message = "Access Denied";
                response.property = undefined;
                response.s3info = undefined;
                callback(response);
              }
            } else {
              response.message = "Access Denied";
              response.property = undefined;
              response.s3info = undefined;
              callback(response);
            }
          });
        } else {
          response.message = "Access Denied";
          response.property = undefined;
          response.s3info = undefined;
          callback(response);
        }
      } else {
        response.message = "Access Denied";
        response.property = undefined;
        response.s3info = undefined;
        callback(response);
      }
    } else {
      response.message = "Access Denied";
      response.property = undefined;
      response.s3info = undefined;
      callback(response);
    }
  } else {
    response.message = "Method not supported";
    response.property = undefined;
    response.s3info = undefined;
    callback(response);
  }
}
