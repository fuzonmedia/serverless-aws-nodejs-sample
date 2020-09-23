const process = require('process');
const parambyname = require('./parambyname');

const AWS = require('aws-sdk');
AWS.config.update({region:'ap-southeast-2'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');

const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';

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
  createProperty: function(info, callback) {
    if (isStringVariableSet(info.ownerSellerId) && isStringVariableSet(info.propertytype) && isStringVariableSet(info.propertyaddress1) && isStringVariableSet(info.propertypostcode)) {
      const timestamp = new Date().getTime();
      var propertyRecordToInsert = {
        id: uuid.v1(),
        ownerSellerId: info.ownerSellerId,
        propertystatus: "draft",
        primary: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      if (isStringVariableSet(info.propertystatus)) {
        propertyRecordToInsert["propertystatus"] = info.propertystatus;
      }
      // Add to propertyRecordToInsert
      if (isStringVariableSet(info.propertytype)) {
        propertyRecordToInsert["propertytype"] = info.propertytype;
      }
      if (isStringVariableSet(info.propertyaddress1)) {
        propertyRecordToInsert["propertyaddress1"] = info.propertyaddress1;
      }
      if (isStringVariableSet(info.propertyaddress2)) {
        propertyRecordToInsert["propertyaddress2"] = info.propertyaddress2;
      }
      if (isStringVariableSet(info.propertycity)) {
        propertyRecordToInsert["propertycity"] = info.propertycity;
      }
      if (isStringVariableSet(info.propertystate)) {
        propertyRecordToInsert["propertystate"] = info.propertystate;
      }
      if (isStringVariableSet(info.propertypostcode)) {
        propertyRecordToInsert["propertypostcode"] = info.propertypostcode;
      }
      if (isStringVariableSet(info.propertyownershipstyle)) {
        propertyRecordToInsert["propertyownershipstyle"] == info.propertyownershipstyle;
      }
      if (isStringVariableSet(info.propertycondition)) {
        propertyRecordToInsert["propertycondition"] == info.propertycondition;
      }
      if (isStringVariableSet(info.propertyvalueoption)) {
        propertyRecordToInsert["propertyvalueoption"] == info.propertyvalueoption;
      }
      const propertydbparams = {
        TableName: process.env.DYNAMODB_PROPERTIES_TABLE,
        Item: propertyRecordToInsert
      }
      dynamoDb.put(propertydbparams, (propertyErr, propertyResult) => {
        if (propertyErr) {
          console.error(propertyErr);
          callback({message: "Error", error: propertyErr});
        } else { // Created
          callback({message: "Done", property: propertyRecordToInsert});
        }
      });
    } else {
      callback({message: "In order to create a property record. The following fields are required: ownerSellerId, propertytype, propertyaddress1, propertypostcode"});
    }
  },
  addFeatureToProperty: function(info, callback) {
    if (isStringVariableSet(info.propertyidentifier) && isStringVariableSet(info.featurename)) {
      var FeatureRecordToInsert = {
        id: uuid.v1(),
        ownerPropertyId: info.propertyidentifier,
        featurestatus: "active",
        featurename: info.featurename,
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime()
      };
      if (info.featurecomments !== undefined) FeatureRecordToInsert['featurecomments'] = info.featurecomments;
      const dbparams = {
          TableName: process.env.DYNAMODB_PROPERTY_FEATURES_TABLE,
          Item: FeatureRecordToInsert
      };
      // do the actual database insert
      dynamoDb.put(dbparams, (error, result) => {
        if (!error) {
          callback({message: "Yes", inserted: result});
        } else {
          callback({message: "No", error: error});
        }
      });
    } else {
      callback({message: "No", error: "Requires: propertyidentifier and featurename"});
    }
  },

  fetchNearbyPOIFeatures: function(info, callback) {
    if (isStringVariableSet(info.propertyidentifier)) {
      const queryfornearbyfeatures = {
         TableName: process.env.DYNAMODB_NEARBY_POI_TABLE,
         ExpressionAttributeNames: {
           '#propertyidentifier': 'ownerPropertyId'
         },
         ExpressionAttributeValues: {
           ':propertyidentifier': info.propertyidentifier
         },
         FilterExpression: '#propertyidentifier = :propertyidentifier'
      };
      // Perform query
      dynamoDb.scan(queryfornearbyfeatures, function(err, res) {
        if (!err) {
          if (res.Count > 0) {
            callback({message: "Yes", nearby: res.Items});
          } else {
            callback({message: "Yes", nearby: []});
          }
        } else {
          callback({message: "Error", error: err});
        }
      });
    } else {
      callback({message: "No"});
    }
  },

  fetchPropertySalesHistory: function(info, callback) {
    if (isStringVariableSet(info.propertyidentifier)) {
      const queryforsaleshistory = {
         TableName: process.env.DYNAMODB_SALES_HISTORY_TABLE,
         ExpressionAttributeNames: {
           '#propertyidentifier': 'ownerPropertyId'
         },
         ExpressionAttributeValues: {
           ':propertyidentifier': info.propertyidentifier
         },
         FilterExpression: '#propertyidentifier = :propertyidentifier'
      };

      // Perform query
      dynamoDb.scan(queryforsaleshistory, function(err, res) {
        if (!err) {
          if (res.Count > 0) {
            callback({message: "Yes", sales: res.Items});
          } else {
            callback({message: "Yes", sales: []});
          }
        } else {
          callback({message: "Error", error: err});
        }
      });
    } else {
      callback({message: "No"});
    }
  },

  fetchPropertyFeatures: function(info, callback) {
    if (isStringVariableSet(info.propertyidentifier)) {
      const queryforfeatures = {
         TableName: process.env.DYNAMODB_PROPERTY_FEATURES_TABLE,
         ExpressionAttributeNames: {
           '#propertyidentifier': 'ownerPropertyId',
           '#status': 'featurestatus'
         },
         ExpressionAttributeValues: {
           ':propertyidentifier': info.propertyidentifier,
           ':status': 'active'
         },
         FilterExpression: '#propertyidentifier = :propertyidentifier AND #status = :status'
      };
      // Perform query
      dynamoDb.scan(queryforfeatures, function(err, res) {
        if (!err) {
          if (res.Count > 0) {
            callback({message: "Yes", features: res.Items});
          } else {
            callback({message: "Yes", features: []});
          }
        } else {
          callback({message: "Error", error: err});
        }
      });
    } else {
      callback({message: "No"})
    }
  },
  fetchPropertyPhotos: function(info, callback) {
    if (isStringVariableSet(info.propertyidentifier)) {
      const queryforcompletedphotos = {
         TableName: process.env.DYNAMODB_PHOTOS_TABLE,
         ExpressionAttributeNames: {
           '#propertyidentifier': 'ownerPropertyId',
           '#status': 'photostatus',
           '#type': 'type'
         },
         ExpressionAttributeValues: {
           ':propertyidentifier': info.propertyidentifier,
           ':status': 'completed',
           ':type': 'property'
         },
         FilterExpression: '#propertyidentifier = :propertyidentifier AND #status = :status AND #type = :type'
      };
      dynamoDb.scan(queryforcompletedphotos, function(err, res) {
        if (!err) {
          if (res.Count > 0) {
            var photoList = [];
            for (var i = 0; i < res.Items.length; i++) {
              var current_photo_record = res.Items[i];
              // Remove fields that we dont need
              var new_photo_record = {
                resizedUrls: {
                  "600px": current_photo_record["resizedUrls"]["600px"],
                  "450px": current_photo_record["resizedUrls"]["450px"],
                  "300px": current_photo_record["resizedUrls"]["300px"],
                },
                createdAt: current_photo_record["createdAt"]
              };
              photoList.push(new_photo_record);
            }
            callback({message: "Yes", photos: photoList});
          } else {
            callback({message: "Yes", photos: []});
          }
        } else {
          callback({message: "Error", error: err});
        }
      });
    } else {
      callback({message: "No"});
    }
  },

  updatePropertyDetails: function(info, updatePdCallback) {
    var updatePdResult = {
      message: "Error",
      error: "Bad Parameters. Require propertyidentifier, ownerSellerId, changes"
    }
    if (isStringVariableSet(info.propertyidentifier) && isStringVariableSet(info.ownerSellerId) && isStringVariableSet(info.changes)) {
      // First check if the property actually exists
      const queryforexistance = {
         TableName: process.env.DYNAMODB_PROPERTIES_TABLE,
         ExpressionAttributeNames: {
           '#identifier': 'id'
         },
         FilterExpression: '#identifier = :identifier',
         ExpressionAttributeValues: {':identifier': info.propertyidentifier}
      };
      dynamoDb.scan(queryforexistance, function(queryError, queryResult) {
        if (!queryError) {
          if (queryResult.Count == 1) {
            if (queryResult["Items"][0]["ownerSellerId"] !== undefined) {
              if (queryResult["Items"][0]["ownerSellerId"] !== null) {
                if (queryResult["Items"][0]["ownerSellerId"] == info.ownerSellerId || info.ownerSellerId == "adminupdate") {
                  // Found a property which matchers the provided seller id now lets try to edit it
                  var updateExpressionValue = 'SET #updated = :updatedvalue';
                  var updateAttributeNames = {
                    '#updated': 'updatedAt'
                  };
                  var updateAttributeValues = {
                    ':updatedvalue': new Date().getTime()
                  };
                  var fieldsToChange = 0;
                  function setDatabaseEntry(field,value) {
                    if (isStringVariableSet(info.changes[field.toString()])) {
                      updateExpressionValue = updateExpressionValue + ", #" + field+ " = :" + field;
                      updateAttributeNames['#' + field] = field.toString();
                      if (info.changes[field.toString()] !== '') {
                        updateAttributeValues[':' + field] = info.changes[field.toString()];
                      } else {
                        updateAttributeValues[':' + field] = null;
                      }
                      fieldsToChange++;
                    }
                  }
                  setDatabaseEntry("propertytype", info.changes.propertytype);
                  setDatabaseEntry("propertyaddress1", info.changes.propertyaddress1);
                  setDatabaseEntry("propertyaddress2", info.changes.propertyaddress2);
                  setDatabaseEntry("propertycity", info.changes.propertycity);
                  setDatabaseEntry("propertypostcode", info.changes.propertypostcode);
                  setDatabaseEntry("propertystatus", info.changes.propertystatus);
                  // Other features
                  setDatabaseEntry("propertysize", info.changes.propertysize);
                  setDatabaseEntry("propertybedrooms", info.changes.propertybedrooms);
                  setDatabaseEntry("propertybathrooms", info.changes.propertybathrooms);                  
                  setDatabaseEntry("propertyparkingspots", info.changes.propertyparkingspots);
                  setDatabaseEntry("propertyrenovated", info.changes.propertyrenovated);

                  // Other features (ownershipstyle and condition)
                  setDatabaseEntry("propertyownershipstyle", info.changes.propertyownershipstyle);
                  setDatabaseEntry("propertycondition", info.changes.propertycondition);
                  setDatabaseEntry("propertyvalueoption", info.changes.propertyvalueoption);

                  const updateparams = {
                    TableName: queryforexistance.TableName,
                    Key: {
                      id: info.propertyidentifier
                    },
                    ExpressionAttributeNames: updateAttributeNames,
                    ExpressionAttributeValues: updateAttributeValues,
                    UpdateExpression: updateExpressionValue,
                    ReturnValues: 'ALL_NEW',
                  };
                  dynamoDb.update(updateparams, function(updatedbError, updatedbResult) {
                    if (!updatedbError) {
                      updatePdResult.message = "Yes";
                      updatePdResult.record = {
                        changes: fieldsToChange,
                        currentRecord: updatedbResult["Attributes"]
                      }
                      updatePdResult.error = undefined
                      updatePdCallback(updatePdResult);
                    } else {
                      updatePdResult.error = "Can't update user database (" + updatedbError.message + "). For support purposes, please quote RequestId: " + updatedbError.requestId + ". ";
                      updatePdResult.message = "Error";
                      updatePdCallback(updatePdResult);
                    }
                  });
                } else { // Seller ID doesn't match
                  updatePdCallback({message: "Error", error: "Property is not owned by the provided seller id"});
                }
              } else {
                updatePdCallback({message: "Error", error: "No valid seller id provided in the record"});
              }
            } else {
              updatePdCallback({message: "Error", error: "No valid seller id provided in the record"});
            }
          } else {
            // Property doesn't exist
            updatePdCallback({message: "Error", error: "Invalid propertyidentifier"});
          }
        } else {
          updatePdCallback({message: "Error", error: queryError.message + ". For support purposes, please quote RequestId: " + queryError.requestId + "."});
        }
      });
    } else { // Invalid parameters
      updatePdCallback(updatePdResult);
    };
  },

  fetchPropertyInfo: function(info, pdcallback) {
    var pdresult = {
      message: "Bad parameters"
    };
    if (isStringVariableSet(info.ownerSellerId) || isStringVariableSet(info.propertyidentifier)) {
      var queryforexistance = {
         TableName: process.env.DYNAMODB_PROPERTIES_TABLE,
         ExpressionAttributeNames: {
           '#identifier': 'propertyidentifier'
         },
         FilterExpression: '#identifier = :identifier',
         ExpressionAttributeValues: {
           ':identifier': ''}
      };
      if (isStringVariableSet(info.ownerSellerId)) {
        queryforexistance.ExpressionAttributeValues[':identifier'] = info.ownerSellerId;
        queryforexistance.ExpressionAttributeNames['#identifier'] = 'ownerSellerId';
      }
      if (isStringVariableSet(info.propertyidentifier)) {
        queryforexistance.ExpressionAttributeValues[':identifier'] = info.propertyidentifier;
        queryforexistance.ExpressionAttributeNames['#identifier'] = 'id';
      }
      dynamoDb.scan(queryforexistance, function(queryError, queryResult) {
        if (!queryError) {
          if (queryResult.Count == 1) {
            pdcallback({message: "Yes", property: queryResult.Items[0]});
          } else {
            // User doesn't exist
            pdcallback({message: "No"});
          }
        } else {
          pdcallback({message: "Error", error: queryError.message + ". For support purposes, please quote RequestId: " + queryError.requestId + "."});
        }
      });
    } else {
        pdcallback(pdresult);
    }
  }
}
