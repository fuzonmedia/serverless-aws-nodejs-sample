const { filter, get, keyBy, map, each, has, find } = require('lodash')
const dynamoDb = require('./util/dynamodb')

const userUtilsLib = require('./userDatabaseUtils');

const debug = require('debug')('storyDatabaseUtils')

var helper = require('sendgrid').mail;

const { send } = require('./util/sendgrid')

const axios = require('axios')
const uuid = require('uuid')

function sendApprovalNotification(ownerSellerId) {
  userUtilsLib.getUserRecord({useridentifier: ownerSellerId}, function(usercb) {
    if (usercb.message == "Done") {
      if (usercb.result.email && usercb.result.emailVerified) {
        sendApprovalMail(usercb.result.email, usercb.result.firstname)
      }
    } else {
     console.error("Error retrieving user");
    }
  });

 function sendApprovalMail(email, firstname) {
   var from_email = new helper.Email('support@agents.com.au', " Agents");
   var to_email = new helper.Email(email.toString());
   var mail = new helper.Mail();
   mail.setFrom(from_email);
   mail.setSubject('Your story has been approved');
   personalization  = new helper.Personalization();
   personalization.addTo(to_email);
   personalization.addSubstitution(
     new helper.Substitution('-firstName-', firstname.toString()));
   mail.addPersonalization(personalization);
   mail.setTemplateId('e7ae45a2-ac5a-455d-a22e-3852d480cb9f');

   return send({ mail }).catch(error => {
    console.error(error);
   })
 }
}

function sendNotificationMail(story, recipients, sandbox = false) {
  const { Substitution, Personalization, Email, Mail, MailSettings } = helper
  if (!Array.isArray(recipients)) {
    recipients = [recipients]
  }

  const mail = new Mail()
  mail.setFrom(new Email('support@agents.com.au', ' Agents'))
  mail.setSubject(`A new story has been posted in ${story.propertysuburb}`)
  mail.setTemplateId('4d9082db-0305-4d68-8189-2f142d3ca010')

  each(recipients, ({ email, firstname }) => {
    const personalization = new Personalization()
    personalization.addSubstitution(new Substitution('-sellerFirstName-', story.firstname))
    personalization.addSubstitution(new Substitution('-suburb-', story.propertysuburb))
    personalization.addSubstitution(new Substitution('-propertytype-', story.property.type))
  
    const bedrooms = (!story.property.bedrooms) ? '-' : story.property.bedrooms
    personalization.addSubstitution(new Substitution('-bedrooms-', bedrooms));
    
    const bathrooms = (!story.property.bathrooms) ? '-' : story.property.bathrooms
    personalization.addSubstitution(new Substitution('-bathrooms-', bathrooms))
    
    const parking = (!story.property.parking) ? '-' : story.property.parking
    personalization.addSubstitution(new Substitution('-parking-', parking))
    personalization.addSubstitution(new Substitution('-propertystreet-', story.property.street))
    personalization.addSubstitution(new Substitution('-storyid-', story.id))
    
    personalization.addTo(new Email(email, firstname))
    personalization.addSubstitution(new Substitution('-firstName-', firstname))

    mail.addPersonalization(personalization)
  })

  return send({ mail, sandbox })
}

function sendNewstoryNotification(story) {
  userUtilsLib.fetchAllUsersByType({usertype: "agent"}, function(userscb) {
    if (userscb.result !== undefined) {
      for (var i = 0; i < userscb.result.length; i++) {
         var user_record = userscb.result[i];
         if (user_record.agentstatus == "active" && user_record.emailVerified) {
           if (checkSuburbs(user_record)) {
            sendNotificationMail(story, user_record);
           }
         }
      }
    } else {
      console.error("Unable to fetch agents");
    }
  });

  function checkSuburbs(agent) {
    if (agent.suburbs && agent.postcodes) {
      var suburbs = agent.suburbs.split(',');
      var postcodes = agent.postcodes.split(',');
      return (postcodes.indexOf(story.propertypostcode.toString()) >= 0 && suburbs.indexOf(story.propertysuburb.toString()) >= 0);
    } else {
      return false;
    }
  }

  
}

function fetchPhotos(id, callback) {
  if (id) {
    const queryforcompletedphotos = {
       TableName: process.env.DYNAMODB_PHOTOS_TABLE,
       ExpressionAttributeNames: {
         '#storyid': 'storyid',
         '#type': 'type',
         '#status': 'photostatus'
       },
       ExpressionAttributeValues: {
         ':storyid': id,
         ':type': 'property',
         ':status': 'completed'
       },
       FilterExpression: '#storyid = :storyid AND #status = :status AND #type = :type'
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
          callback({message: "Done", photos: photoList});
        } else {
          callback({message: "Done", photos: []});
        }
      } else {
        callback({message: "Error", error: err});
      }
    });
  } else {
    callback({message: "Access Denied"});
  }
}

const fetchstory = (id) => {
  const storyTableQuery = {
    TableName: process.env.DYNAMODB_storyS_TABLE,
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: {
      ':id': id,
    }
  }
  debug(`story get query: ${JSON.stringify(storyTableQuery)}`)
  return dynamoDb.queryAsync(storyTableQuery).then(({ Items, Count }) => (Count > 0) ? Items[0] : null)
}

const createstoryInsertData = (info, id = null) => {
  //top level variables to watch out for
  const acceptedVars = [
    'property',
    'priceMin',
    'priceMax',
    'isPrimaryProperty',
    'isTenanted',
    'isFixedTerm',
    'leaseEndDate',
    'salestimeframe',
    'agentquestions',
    'requestedAgent',
  ]

  if (id) {
    info.ownerSellerId = id
  }

  if (!info.property || !info.property.city || !info.property.postcode || !info.ownerSellerId) {
    return null
  }

  const now = new Date().getTime()
  const data = {
    id: uuid.v1(),
    storystatus: 'pending',
    ownerSellerId: info.ownerSellerId,
    createdAt: now,
    updatedAt: now,
    //pull up property suburb and postcode for agent filtering
    propertysuburb: info.property.city,
    propertypostcode: info.property.postcode
  }

  for (key of acceptedVars) {
    if (info[key]) {
      data[key] = info[key];
    }
  }

  return data
}

module.exports = {
  sendNotificationMail,
  fetchstory,
  createstoryInsertData,
  storestory: (data) => new Promise((resolve, reject) => {
    let storyRecordToInsert = createstoryInsertData(data)

    if (!storyRecordToInsert) {
      return resolve(null)
    }

    let dataPromise = new Promise(resolve => resolve(storyRecordToInsert))

    if (!has(data.property, 'geoLocation.longitude') || !has(data, 'property.geoLocation.latitude')) {
      let address = []
      for (let part of ['address1', 'city', 'state']) {
        if (has(data.property, part)) {
          address.push(data.property[part])
        }
      }
      address.push('Australia')
      // We need exact amount of arguments
      if (address.length === 4) {
        debug('Fetching object location')
        dataPromise = axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: {
            address: address.join(','),
            key: process.env.GOOGLE_API_KEY,
          },
        }).catch(
          e => {
            debug(`Google API exception: ${e.message}`)
            return storyRecordToInsert
          }
        ).then(
          response => {
            debug(`Google API Response: ${JSON.stringify(response.data)}`)
            if (!response.data.results || response.data.results.length === 0) {
              debug('Empty location results.')
              return storyRecordToInsert
            }

            const result = find(response.data.results, r => {
              return r.types.indexOf('street_address') !== -1
            })

            if (!result) {
              debug('Cannot find street_address result')
              return storyRecordToInsert
            }

            storyRecordToInsert.property.geoLocation = {
              latitude: result.geometry.location.lat,
              longitude: result.geometry.location.lng,
            }
            storyRecordToInsert.property.address_components = result.address_components
            storyRecordToInsert.property.formatted_address = result.formatted_address
            return storyRecordToInsert
          }
        )
      }
    }

    const TableName = process.env.DYNAMODB_storyS_TABLE

    dataPromise.then(
      Item => {
        debug(JSON.stringify(Item))
        return dynamoDb.putAsync({ TableName, Item }).catch(
          error => { throw new Error('story record not created') }
        ).then(
          () => resolve(Item)
        )
      }
    )
  }),

  // updatestory: (id, data) => new Promise((resolve, reject) => {
  //   if (!data && typeof id === 'object') {
  //     data = id
  //     id = data.id
  //   }
  //
  //   if (!id) {
  //     reject(new Error('ID required'))
  //   }
  //
  //   if (!data) {
  //     reject(new Error('Data required'))
  //   }
  //
  //
  //
  //   const updateQuery = {
  //     TableName: process.env.DYNAMODB_storyS_TABLE,
  //     Key: { id },
  //   }
  // }),
  createstoryRecord: function(info, id, callback) {
    console.log('[createstoryRecord] is DEPRECATED. Use createstoryInsertData instead')

    debug('createstoryRecord')
    debug(id)
    debug(info)

    const storyRecordToInsert = createstoryInsertData(info, id)
    if (storyRecordToInsert === null) {
      return callback("Missing required parameters")
    }

    callback(storyRecordToInsert)
  },
  getstory: function(id, callback) {
    fetchstory.catch(storyTableErr => {
      return callback({message: "Error", result: storyTableErr});
    }).then(found_story => {
      if (found_story === null) {
        return callback({message: "story doesn't exist", result: {}});
      }
      fetchPhotos(found_story.id, function(photocb) {
        if (photocb.message == "Done") {
          found_story.photos = photocb.photos;
        }
        callback({message: "Done", result: found_story});
      });
    })
  },
  getstoryByOwner: function(ownerid, callback) {
    var storyTableQuery = {
       TableName: process.env.DYNAMODB_storyS_TABLE,
       ExpressionAttributeNames: {
         '#id': 'ownerSellerId'
       },
       FilterExpression: '#id = :id',
       ExpressionAttributeValues: {':id': ownerid}
    };
    dynamoDb.scan(storyTableQuery, function(storyTableErr, storyTableRes) {
      if (!storyTableErr) {
        if (storyTableRes.Count > 0) {
          var found_story = storyTableRes.Items[0];
          fetchPhotos(found_story.id, function(photocb) {
            if (photocb.message == "Done") {
              found_story.photos = photocb.photos;
            }
            callback({message: "Done", result: found_story});
          });
        } else {
          callback({message: "story doesn't exist", result: {}});
        }
      } else {
        callback({message: "Error", result: storyTableErr});
      }
    });
  },
  updatestoryRecord: function(info, callback) {
    if (info.id) {
      this.getstory(info.id, function(res) {
        if (res.message == "Done") {
          var storyTableUpdate = {
             TableName: process.env.DYNAMODB_storyS_TABLE,
             Key: {
               'id' : info.id
             },
             ExpressionAttributeNames: {
               '#updated': 'updatedAt'
             },
             ExpressionAttributeValues: {
               ':updatedvalue': new Date().getTime()
             },
             UpdateExpression: 'SET #updated = :updatedvalue',
             ReturnValues: 'ALL_NEW'
          };

          var fieldsToChange = 0;
          const acceptedVars = ["property", "priceMin", "priceMax", "isPrimaryProperty", "isTenanted", "isFixedTerm", "leaseEndDate", "salestimeframe", "agentquestions", "requestedAgent", "storystatus"];

          var approvedstory = false;

          for (key in info.changes) {
            if (acceptedVars.indexOf(key) >= 0 && info.changes[key] && info.changes[key] != res.result[key]) {
              storyTableUpdate.UpdateExpression += ", #" + key+ " = :" + key;
              storyTableUpdate.ExpressionAttributeNames["#" + key] = key;
              storyTableUpdate.ExpressionAttributeValues[":" + key] = info.changes[key];
              fieldsToChange++;
              if (key == "storystatus" && info.changes[key] == "approved") {
                approvedstory = true;
              }
            }
          }
          dynamoDb.update(storyTableUpdate, function(updatedbError, updatedbResult) {
            if (!updatedbError) {
              if (fieldsToChange > 0) {
                if (approvedstory) {
                  sendApprovalNotification(res.result.ownerSellerId);
                  sendNewstoryNotification(res.result);
                }
                callback({message: "Done", result: {input: storyTableUpdate, result: updatedbResult, fieldsChanged: fieldsToChange}});
              } else {
                callback({message: "Nothing changed", result: {input: storyTableUpdate, result: updatedbResult}});
              }
            } else {
              callback({message: "Error", result: {input: storyTableUpdate, result: updatedbError}});
            }
          });
        } else {
          response.message = "Error retrieving story";
          callback(response);
        }
      });
    } else {
      response.message = "Invalid request";
      callback(response);
    }
  },
  liststoryRecord: function(info, callback) {
    var storyTableScan = {
       TableName: process.env.DYNAMODB_storyS_TABLE
    };
    if (info.storyid) {
      storyTableScan.ExpressionAttributeNames = {
        '#id': 'id'
      };
      storyTableScan.ExpressionAttributeValues = {
        ':id': info.storyid
      }
      storyTableScan.FilterExpression = '#id = :id'
    }

    if (info.suburbfilter) {
      storyTableScan.ExpressionAttributeNames = {
        '#suburb': 'propertysuburb'
      };
      var suburbs = info.suburbfilter.split(',');
      storyTableScan.ExpressionAttributeValues = {
        ':suburbs': suburbs
      }
      storyTableScan.FilterExpression = 'contains(:suburbs, #suburb)'
    }

    if (info.statusfilter !== undefined) {
      if (storyTableScan.ExpressionAttributeNames !== undefined) {
        storyTableScan.ExpressionAttributeNames['#status'] = 'storystatus';
      } else {
        storyTableScan.ExpressionAttributeNames = {
          '#status': 'storystatus'
        }
      }
      if (storyTableScan.ExpressionAttributeValues !== undefined) {
        storyTableScan.ExpressionAttributeValues[':status'] = info.statusfilter;
      } else {
        storyTableScan.ExpressionAttributeValues = {
          ':status': info.statusfilter
        }
      }
      if (storyTableScan.FilterExpression !== undefined) {
        storyTableScan.FilterExpression = storyTableScan.FilterExpression.toString() + ' AND #status = :status'
      } else {
        storyTableScan.FilterExpression = '#status = :status'
      }
    }

    debug(`Scanning storys table with parameters: ${JSON.stringify(storyTableScan)}`)
    dynamoDb.scan(storyTableScan, function(blErr, blRes) {
      if (!blErr) {
        debug(`Received ${blRes.Count} story items`)
        if (blRes.Count > 0) {
          let storys = [];

          if (info.postcodefilter) {
            var postcodes = info.postcodefilter.split(",");
            blRes.Items.forEach(function(story, i) {
              var postcode = story.propertypostcode.toString();
              if (postcodes.indexOf(postcode) >= 0) {
                storys.push(story);
              }
            });
          } else {
            storys = blRes.Items;
          }

          const userIds = [];
          const promises = map(storys, (item) => {
            userIds.push(item.ownerSellerId)
            return fetchPhotos(item.id, function(photocb) {
              if (photocb.message == "Done") {
                item.photos = photocb.photos;
              }
            });
          });
          const photosPromise = Promise.all(promises)
          const usersQuery = {
            TableName: process.env.DYNAMODB_USERS_TABLE,
            ScanFilter: {
              id: {
                ComparisonOperator: 'IN',
                AttributeValueList: filter(userIds)
              },
            },
          }
          debug(`Query users table with parameters: ${JSON.stringify(usersQuery)}`)
          const usersPromise = dynamoDb.scanAsync(usersQuery).catch(e => {
            console.log('Unable to fetch users')
            console.log(e)
            return []
          }).then(({ Items, Count }) => {
            debug(`Received ${Count} users.`)
            return keyBy(Items, 'id')
          })
          Promise.all([usersPromise, photosPromise]).then(([usersResult]) => {
            callback({
              message: "Done",
              result: map(storys, story => Object.assign(story, {
                ownerSellerFirstname: get(usersResult, [story.ownerSellerId, 'firstname'])
              }))
            });
          });
        } else {
          callback({message: "Done", result: []});
        }
      } else {
        callback({message: "Error (" + JSON.stringify(blErr) + ")", result: []});
      }
    });
  }
};
