const debug = require('debug')('utils::users')
const dynamoDb = require('./util/dynamodb')
const { makeQueryExpressionParams } = dynamoDb
const uuid = require('uuid');
const crypto = require('crypto'); // for signing policies
const btoa = require('btoa');
const aws_secret = process.env.AWS_S3_UPLOAD_SECRET;

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
};

const checkUserByField = (field, value, allowMultiple = false) => {
  return new Promise((resolve, reject) => {
    if (!field) {
      reject(new Error('Field must not be empty'))
    }
    if (!value) {
      reject(new Error('Value must not be empty'))
    }

    const multiValue = Array.isArray(value)
    let method = 'scanAsync'

    if (!multiValue && ['email', 'domain_agent_id'].indexOf(field) > -1) {
      method = 'queryAsync'
    } else if (multiValue) {
      // If array of values passed, force multiple values to be allowed
      allowMultiple = true
    }

    const query = makeQueryExpressionParams(field, value, method)

    query.TableName = process.env.DYNAMODB_USERS_TABLE

    if (!multiValue && field === 'domain_agent_id') {
      query.IndexName = 'domain_agent_id-index'
      debug(`Setting query target to include index domain_agent_id-index`)
    }

    debug(`Checking user data: ${JSON.stringify(query)}`)

    return dynamoDb[method](query).then(({ Count, Items = [] }) => {
      if (allowMultiple) {
        return resolve(Items)
      }
      if (Count > 1) {
        return reject(new Error(`${Count} user found for [${field}] with value [${value}]`))
      }
      return resolve(Count === 1 ? Items[0] : null)
    }).catch(e => {
      debug(`Error: ${JSON.stringify(e)}`)
      return reject(new Error(`${e.message}. For support purposes, please quote RequestId: ${e.requestId}.`))
    })
  })
}

const fetchUsersByField = (field, value) => checkUserByField(field, value, true)

module.exports = {
  fetchAllUsersByType: function(info, callback) {
    var usertype = info.usertype || "agent"
    var userTableAgentQuery = {
      TableName: process.env.DYNAMODB_USERS_TABLE,
      ExpressionAttributeNames: {
        '#usertype': 'usertype'
      },
      FilterExpression: '#usertype = :usertype',
      ExpressionAttributeValues: {':usertype': usertype}
    };
    dynamoDb.scan(userTableAgentQuery, function(usertableErr, usertableRes) {
      if (!usertableErr) {
        if (usertableRes.Count > 0) {
          callback({message: "Done", result: usertableRes.Items});
        } else {
          callback({message: "Done", result: []});
        }
      } else {
        callback({message: "Error", result: usertableErr});
      }
    });
  },
  fetchUsersByField,
  checkUserByField,
  getUserRecord: function(info, callback) { // Fetch a user record if an user identifier is provided
    if (!info.useridentifier) {
      return callback({message: "Requires 'useridentifier' parameter"})
    }
    return checkUserByField('id', info.useridentifier).then(user => {
      if (!user) {
        return callback({message: "User doesn't exist", result: {}})
      }
      callback({message: "Done", result: user})
    }).catch(usertableErr => {
      callback({message: "Error", result: usertableErr})
    })
  },
  updateUserRecordWithID: function(info, callback) {
    if (info.useridentifier !== undefined && info.changes !== undefined) {
      var userTableQuery = {
         TableName: process.env.DYNAMODB_USERS_TABLE,
         ExpressionAttributeNames: {
           '#id': 'id'
         },
         FilterExpression: '#id = :id',
         ExpressionAttributeValues: {':id': info.useridentifier}
      };
      dynamoDb.scan(userTableQuery, function(usertableErr, usertableRes) {
        if (!usertableErr) {
          if (usertableRes.Count == 1) {
            var found_user = usertableRes.Items[0];
            var emailaddress = found_user['email'];
            // Do the update
            var userTableUpdate = {
               TableName: process.env.DYNAMODB_USERS_TABLE
            };
            var updateExpressionValue = 'SET #updated = :updatedvalue';
            var updateAttributeNames = {
              '#updated': 'updatedAt'
            };
            var updateAttributeValues = {
              ':updatedvalue': new Date().getTime()
            };
            var fieldsToChange = 0;
            userTableUpdate['Key'] = {
              'email': emailaddress
            };
            function setDatabaseEntry(field,value) {
              if ((typeof info.changes[field.toString()]) !== "string") {
                updateExpressionValue = updateExpressionValue + ", #" + field+ " = :" + field;
                updateAttributeNames['#' + field] = field.toString();
                updateAttributeValues[':' + field] = value;
              } else {
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
            }
            if (info.changes.whitelistedcontacts !== undefined) setDatabaseEntry("whitelistedcontacts", info.changes.whitelistedcontacts); // Set whitelisted contacts
            if (info.changes.shortlist !== undefined) setDatabaseEntry("shortlist", info.changes.shortlist); // Set whitelisted contacts
            if (info.changes['name'] !== undefined) setDatabaseEntry("name", info.changes['name']); // Set name
            if (info.changes['firstname'] !== undefined) setDatabaseEntry("firstname", info.changes['firstname']); // Set first name
            if (info.changes['lastname'] !== undefined) setDatabaseEntry("lastname", info.changes['lastname']); // Set last name
            if (info.changes['contactnumber'] !== undefined) setDatabaseEntry("contactnumber", info.changes['contactnumber']); // Set contact number
            if (info.changes.agentlicense !== undefined) setDatabaseEntry("agentlicense", info.changes.agentlicense); // Set Agent License
            if (info.changes.agentstatus !== undefined) setDatabaseEntry("agentstatus", info.changes.agentstatus); // Set Agent Status
            if (info.changes.profilephoto !== undefined) setDatabaseEntry("profilephoto", info.changes.profilephoto); // Set Profile photo
            if (info.changes.profilephotos !== undefined) setDatabaseEntry("profilephotos", info.changes.profilephotos); // Set Profile photos
            if (info.changes.videoprofile !== undefined) setDatabaseEntry("videoprofile", info.changes.videoprofile); // Video status
            if (info.changes.biography !== undefined) setDatabaseEntry("biography", info.changes.biography); // Biography
            if (info.changes.personal !== undefined) setDatabaseEntry("personal", info.changes.personal); // Personal
            if (info.changes.company !== undefined) setDatabaseEntry("company", info.changes.company); // Company

            if (info.changes.postcode !== undefined) setDatabaseEntry("postcode", info.changes.postcode); // Set Postcode

            if (info.changes.preferredlanguage !== undefined) setDatabaseEntry("preferredlanguage", info.changes.preferredlanguage); // Set Preferred language
            if (info.changes.agentexperience !== undefined) setDatabaseEntry("agentexperience", info.changes.agentexperience); // Set The Agent Experience
            if (info.changes.propertyselltimeframe !== undefined) setDatabaseEntry("propertyselltimeframe", info.changes.propertyselltimeframe); // Set property sell timeframe
            if (info.changes.propertysalepreference !== undefined) setDatabaseEntry("propertysalepreference", info.changes.propertysalepreference); // Set Property sell preference

            userTableUpdate["ExpressionAttributeNames"] = updateAttributeNames;
            userTableUpdate["ExpressionAttributeValues"] = updateAttributeValues;
            userTableUpdate["UpdateExpression"] = updateExpressionValue;
            userTableUpdate["ReturnValues"] = 'ALL_NEW';

            dynamoDb.update(userTableUpdate, function(updatedbError, updatedbResult) {
              if (!updatedbError) {
                callback({message: "Done", result: {input: userTableUpdate, result: updatedbResult, fieldsChanged: fieldsToChange}});
              } else {
                callback({message: "Error", result: {input: userTableUpdate, result: updatedbError}});
              }
            });
          } else {
            callback({message: "User doesn't exist", result: {}});
          }
        } else {
          callback({message: "Error", result: usertableErr});
        }
      });
    } else {
      callback({message: "Requires 'useridentifier' parameter"});
    }
  },
  updateUserRecord: function(info, callback) {
    var userTableUpdate = {
       TableName: process.env.DYNAMODB_USERS_TABLE
    };
    var updateExpressionValue = 'SET #updated = :updatedvalue';
    var updateAttributeNames = {
      '#updated': 'updatedAt'
    };
    var updateAttributeValues = {
      ':updatedvalue': new Date().getTime()
    };
    var fieldsToChange = 0;
    if (info.emailaddress && info.changes) {
      userTableUpdate['Key'] = {
        'email': info.emailaddress
      };
      for(key in info.changes) {
        if (info.changes[key]) {
          updateExpressionValue += ", #" + key + " = :" + key;
          updateAttributeNames["#" + key] = key;
          updateAttributeValues[":" + key] = info.changes[key];
          // Hack
          if (key === 'domain_agent_id') {
            updateAttributeValues[":" + key] = parseInt(info.changes[key]);
          }
          fieldsToChange++;
        }
      }
      userTableUpdate["ExpressionAttributeNames"] = updateAttributeNames;
      userTableUpdate["ExpressionAttributeValues"] = updateAttributeValues;
      userTableUpdate["UpdateExpression"] = updateExpressionValue;
      userTableUpdate["ReturnValues"] = 'ALL_NEW';

      debug(userTableUpdate)

      dynamoDb.update(userTableUpdate, function(updatedbError, updatedbResult) {
        if (!updatedbError) {
          callback({message: "Done", result: {input: userTableUpdate, result: updatedbResult, fieldsChanged: fieldsToChange}});
        } else {
          callback({message: "Error", result: {input: userTableUpdate, result: updatedbError}});
        }
      });
    } else {
      callback({message: "Missing required parameters: emailaddress, changes[]"});
    }
  },
  prepareforprofilepicupload: function(info, callback) {
    if (isStringVariableSet(info.useridentifier)) {
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
      // Create metadata in photos database against useridentifier
      var photoRecordToInsert = {
        id: uuid.v1(),
        useridentifier: info.useridentifier,
        photostatus: "unprocessed",
        type: "profilephoto",
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
            useridentifier: info.useridentifier,
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
          response.s3info = undefined;
        }
      });
    } else {
      callback({message: "Requires 'useridentifier'"})
    }
  },
  checkUser: function(email, resultcb = null) {
    // Backward compatible function with callback
    debug(`checkUser: ${email}`)

    if (resultcb === null) {
      return checkUserByField('email', email)
    }

    if (isStringVariableSet(email)) {
      return checkUserByField('email', email).then(user => {
        return user ? resultcb({ message: 'Yes', user }) : resultcb({ message: 'No' })
      }).catch(e => {
        resultcb({ message: 'Error', error: e.message })
      })
    } else {
      return resultcb({ message: 'Error', error: "Email can't be empty" })
    }
  },
  fetchUserBySlug: (slug) => {
    const base = slug.replace(/-\d+$/, '')
    const slugGetQuery = {
      TableName: 'agentsUsersSlugs',
      Key: { base, slug },
    }
    debug(`Fetching user slug: ${JSON.stringify(slugGetQuery)}`)
    return dynamoDb.getAsync(slugGetQuery).catch(e => {
      debug(`Database error: ${e.message}`)
      return null
    }).then(
      result => {
        const promises = []
        const resolvedSlug = result.Item
        if (!resolvedSlug) {
          return null
        }
        const userGetQuery = {
          TableName: process.env.DYNAMODB_USERS_TABLE,
          Key: { email: resolvedSlug.email }
        }
        debug(`Fetching user by email: ${JSON.stringify(userGetQuery)}`)
        promises.push(dynamoDb.getAsync(userGetQuery).catch(e => {
          debug(`Database error: ${e.message}`)
          return null
        }).then(({ Item }) => Item))

        debug(`Resolved slug: ${JSON.stringify(resolvedSlug)}`)
        if (!resolvedSlug.active) {
          const activeSlugQuery = {
            TableName: 'agentsUsersSlugs',
            IndexName: 'email-slug-index',
            KeyConditionExpression: 'email = :email',
            FilterExpression: 'active = :active',
            ExpressionAttributeValues: {
              ':email': resolvedSlug.email,
              ':active': true,
            },
          }
          debug(`Fetching active slug: ${JSON.stringify(activeSlugQuery)}`)
          promises.push(dynamoDb.queryAsync(activeSlugQuery).catch(e => {
            debug(`Database error: ${e.message}`)
            return null
          }).then(({ Items, Count }) => {
            if (Count > 1) {
              console.log(`WARNING!!! more than 1 active slug for: ${resolvedSlug.email}`)
              return null
            }
            if (Count === 0) {
              console.log(`WARNING!!! no active slugs for: ${resolvedSlug.email}`)
              return null
            }
            debug(`Active slug detected ${JSON.stringify(Items[0])}`)
            return Items[0]
          }))
        }

        return Promise.all(promises).then(values => {
          const user = values[0]
          const redirect = values[1] ? values[1].slug : null
          return { user, resolvedSlug, redirect }
        })
      }
    )
  },
  fetchUserBySlugLegacy: function(info, callback) { // Fetch a user record if an user identifier is provided
    if (info.slug === undefined) {
      return callback({message: "Requires 'slug' parameter"});
    }
    this.fetchUserBySlug(info.slug).then(({ user, resolvedSlug, redirect }) => {
      if (user === null) {
        return callback({message: "User doesn't exist", result: {}});
      }
      return callback({message: "Done", result: user, resolvedSlug, redirect});
    }).catch(e => {
      return callback({message: "Error", result: e.message});
    })
  },
};
