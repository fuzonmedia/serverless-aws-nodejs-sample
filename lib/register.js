/**
 * DEPRECATED
 */

// Register function
const crypto = require('crypto');

// Sendgrid stuff
var helper = require('sendgrid').mail;
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY);

const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');
const storyUtilsLib = require('./storyDatabaseUtils');
const liststoryRecord = storyUtilsLib.liststoryRecord;
const addstoryRecord = storyUtilsLib.addstoryRecord;
const updatestoryRecord = storyUtilsLib.updatestoryRecord;

const { pickBy } = require('lodash')

// Helper functions
// Validate email
function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

// Generate uuid with agent name
function generateUUID(first, last) {
    return first.toLowerCase() + "-" + last.toLowerCase() + "-" + Math.floor(Math.random() * (Math.ceil(Math.random() * 8) + 1) * 100000);
}

// Lets see if this is empty
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

function checkUser(email, resultcb) {
  if (isStringVariableSet(email)) {
    const queryforexistance = {
       TableName: process.env.DYNAMODB_USERS_TABLE,
       KeyConditionExpression: 'email = :email',
       ExpressionAttributeValues: {':email': email}
    };
    dynamoDb.query(queryforexistance, function(queryError, queryResult) {
      if (!queryError) {
        if (queryResult.Count == 1) {
          resultcb({message: "Yes", user: queryResult.Items[0]});
        } else {
          // User doesn't exist
          resultcb({message: "No"});
        }
      } else {
        resultcb({message: "Error", error: queryError.message + ". For support purposes, please quote RequestId: " + queryError.requestId + "."});
      }
    });
  } else {
    resultcb({message: "Error", error: "Email can't be empty"});
  }
}
// response
// Actual module code
module.exports = function(info, callback) {
  var responseBody = {
    message: "Access Denied"
  }

  const input = pickBy(info)

  if (!input.usertype) {
    responseBody['message'] = "Registration requires a user type"
    responseBody['token'] = undefined
    callback(responseBody)
    return
  }

  if (['seller', 'agent', 'superagent', 'admin'].indexOf(input.usertype) < 0) {
    responseBody['message'] = "That account type can not be registered";
    responseBody['token'] = undefined;
    callback(responseBody);
    return
  }

  const registerSeller = () => {
    if (!input.email) {
      return ["Email is required", undefined]
      responseBody['message'] = "Email is required";
      responseBody['token'] = undefined;
      callback(responseBody);
      return
    }
    if (!validateEmail(input.email)) {
      responseBody['message'] = "Email does not appear to be valid";
      responseBody['token'] = undefined;
      callback(responseBody);
      return
    }
    if (process.env.NODE_ENV === 'test') {
      responseBody['message'] = "Done";
      responseBody['token'] = "token";
      callback(responseBody);
      return
    }
          // If not test then lets do some database stuff
          checkUser(info.email, function(checkUserCB) {
            if (checkUserCB.message == "Yes") {
              if (checkUserCB.user.emailVerified == true) {
                if (isStringVariableSet(info.password)) {
                  const dummyPassword = crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update("123456789").digest('hex')
                  const passwordFromUser = crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(info.password).digest('hex');
                  if (isStringVariableSet(checkUserCB["user"]["password"])) {
                    if (passwordFromUser == checkUserCB["user"]["password"]) {
                      console.log('Matching password');
                      // Make sure password matches
                      responseBody['message'] = 'Done'
                      if (checkUserCB["user"]["token"] !== undefined) responseBody['token'] = checkUserCB["user"]["token"];
                      if (isStringVariableSet(checkUserCB["user"]["id"])) responseBody["identifier"] = checkUserCB["user"]["id"];
                      if (isStringVariableSet(checkUserCB["user"]["firstname"])) responseBody["firstname"] = checkUserCB["user"]["firstname"];
                      if (isStringVariableSet(checkUserCB["user"]["lastname"])) responseBody["lastname"] = checkUserCB["user"]["lastname"];
                      if (isStringVariableSet(checkUserCB["user"]["profilephoto"])) responseBody["profilephoto"] = checkUserCB["user"]["profilephoto"];
                      if (isStringVariableSet(checkUserCB["user"]["usertype"])) responseBody["usertype"] = checkUserCB["user"]["usertype"];
                      callback(responseBody);
                    } else {
                      responseBody['message'] = 'Access Denied'
                      responseBody['token'] = undefined;
                      callback(responseBody);
                    }
                  } else { // Password not in database
                    if (passwordFromUser == dummyPassword) {
                      console.log('Dummy password used')
                      responseBody['message'] = 'Done'
                      if (checkUserCB["user"]["token"] !== undefined) responseBody['token'] = checkUserCB["user"]["token"];
                      callback(responseBody);
                    } else {
                      console.log('No matching password to dummy password');
                      responseBody['message'] = 'Access Denied'
                      responseBody['token'] = undefined;
                      callback(responseBody);
                    }
                  }
                } else { // No password defined - undefined
                  console.log('Password not specified');
                  responseBody['message'] = 'Access Denied'
                  responseBody['token'] = undefined;
                  callback(responseBody);
                }
              } else {
                responseBody['message'] = "You must verify your email before proceeding";
                responseBody['token'] = undefined;
                callback(responseBody);
              }
            } else if (checkUserCB.message == "No") {
              if (isStringVariableSet(info.propertytype) && isStringVariableSet(info.propertyaddress1) && isStringVariableSet(info.propertypostcode) && isStringVariableSet(info.password)) {
                // Make sure the user specifies the following variables
                const timestamp = new Date().getTime();
                var recordToInsert = {
                  email: info.email,
                  usertype: info.usertype,
                  id: uuid.v1(),
                  emailToken: crypto.createHash('md5').update("email=" + info.email + "&timestamp=" + timestamp).digest('hex'),
                  emailVerified: false,
                  password: crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(info.password).digest('hex'),
                  createdAt: timestamp,
                  updatedAt: timestamp
                };
                var propertyRecordToInsert = {
                  id: uuid.v1(),
                  ownerSellerId: recordToInsert['id'],
                  propertystatus: "draft",
                  primary: true,
                  createdAt: timestamp,
                  updatedAt: timestamp
                }
                // Optional fields (Seller):
                if (isStringVariableSet(info['firstname'])) recordToInsert['firstname'] = info['firstname'];
                if (isStringVariableSet(info['lastname'])) recordToInsert['lastname'] = info['lastname'];
                if (isStringVariableSet(info['contactnumber'])) recordToInsert['contactnumber'] = info['contactnumber'];
                if (isStringVariableSet(info['preferredlanguage'])) recordToInsert['preferredlanguage'] = info['preferredlanguage'];

                // Seller questionairre fields
                if (isStringVariableSet(info['agentexperience'])) recordToInsert['agentexperience'] = info['agentexperience'];
                if (isStringVariableSet(info['propertyselltimeframe'])) recordToInsert['propertyselltimeframe'] = info['propertyselltimeframe'];
                if (isStringVariableSet(info['propertysalepreference'])) recordToInsert['propertysalepreference'] = info['propertysalepreference'];
                if (isStringVariableSet(info['propertycommissionpreference'])) recordToInsert['propertycommissionpreference'] = info['propertycommissionpreference'];

                // Check Property Type?
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
                  propertyRecordToInsert["propertyownershipstyle"] = info.propertyownershipstyle;
                }
                if (isStringVariableSet(info.propertycondition)) {
                  propertyRecordToInsert["propertycondition"] = info.propertycondition;
                }
                if (isStringVariableSet(info.propertyvalueoption)) {
                  propertyRecordToInsert["propertyvalueoption"] = info.propertyvalueoption;
                }

                if (isStringVariableSet(info.propertyparkingspots)) {
                  propertyRecordToInsert["propertyparkingspots"] = info.propertyparkingspots;
                }
                if (isStringVariableSet(info.propertybedrooms)) {
                  propertyRecordToInsert["propertybedrooms"] = info.propertybedrooms;
                }
                if (isStringVariableSet(info.propertybathrooms)) {
                  propertyRecordToInsert["propertybathrooms"] = info.propertybathrooms;
                }

                if (isStringVariableSet(info.propertyprice)) {
                  var storyRecordToInsert = {
                    propertyprice: info.propertyprice
                  };
                  if (isStringVariableSet(info.desiredprice)) storyRecordToInsert['desiredprice'] = info.desiredprice;
                  if (isStringVariableSet(info.salesstart)) storyRecordToInsert['salesstart'] = info.salesstart;
                  if (isStringVariableSet(info.salestimeframe)) storyRecordToInsert['salestimeframe'] = info.salestimeframe;
                  if (isStringVariableSet(info.storysummary)) storyRecordToInsert['storysummary'] = info.storysummary;
                  if (isStringVariableSet(info.storydeadline)) storyRecordToInsert['storydeadline'] = info.storydeadline;
                }
                const dbparams = {
                  TableName: process.env.DYNAMODB_USERS_TABLE,
                  Item: recordToInsert
                };
                const propertydbparams = {
                  TableName: process.env.DYNAMODB_PROPERTIES_TABLE,
                  Item: propertyRecordToInsert
                }
                // User doesn't exist lets create
                dynamoDb.put(dbparams, (error, result) => {
                  if (error) {
                    console.error(error);
                    responseBody['message'] = "Cant create user record due to error";
                    responseBody['token'] = undefined;
                    callback(responseBody);
                  } else {
                    dynamoDb.put(propertydbparams, (propertyErr, propertyResult) => {
                      if (propertyErr) {
                        console.error(propertyErr);
                        console.log("User info: " + JSON.stringify(result));
                        responseBody['message'] = "Cant create property record due to error.";
                        responseBody['token'] = undefined;
                        callback(responseBody);
                      } else {
                        function outputRegisterSuccessOrFail(sellerregistermessage) {
                          // Build the email
                          var from_email = new helper.Email('noreply@agents.com.au');
                          var to_email = new helper.Email(info.email.toString());
                          var subject = 'Please verify your email';
                          var content = new helper.Content('text/plain', 'Hello!\nPlease verify your email at http://apidocs.agents.com.au/examples/verifyemail.html#emailtoken=' + recordToInsert['emailToken'] + '&email=' + encodeURIComponent(info.email));
                          var mail = new helper.Mail(from_email, subject, to_email, content);
                          // Send off the email
                          var sg = require('sendgrid')(process.env.SENDGRID_API_KEY);
                          var request = sg.emptyRequest({
                            method: 'POST',
                            path: '/v3/mail/send',
                            body: mail.toJSON(),
                          });
                          sg.API(request, function(error, response) {
                            console.log(response.statusCode);
                            console.log(response.body);
                            console.log(response.headers);
                          });

                          // Done
                          responseBody['message'] = sellerregistermessage;
                          responseBody['token'] = undefined; // No need to provide token for new user
                          callback(responseBody);
                        }
                        // Success or FAIL
                        if (storyRecordToInsert !== undefined) {
                          if (isStringVariableSet(info.propertyprice)) { // is there a price set
                            storyRecordToInsert['propertyidentifier'] = propertydbparams['Item']['id'];
                            storyRecordToInsert['ownerSellerId'] = propertydbparams['Item']['ownerSellerId'];
                            addstoryRecord(storyRecordToInsert, function(storyCB) {
                              console.log("story input");
                              console.log(storyRecordToInsert);
                              console.log("Create story");
                              console.log(storyCB);
                              if (storyCB.message !== "Done") {
                                outputRegisterSuccessOrFail("User Registered, however story not created due to error (" + storyCB.message + ")");
                              } else {
                                outputRegisterSuccessOrFail("Done");
                              }
                            });
                          }
                        } else { // No story record
                          outputRegisterSuccessOrFail("Done");
                        }
                      }
                    });
                  }
                });
              } else {
                responseBody['message'] = "Seller is requires the following parameters: propertytype, propertyaddress1, propertypostcode, email, password";
                responseBody['token'] = undefined;
                callback(responseBody);
              }
            } else if (checkUserCB.message == "Error") {
              responseBody['message'] = "Cant find users table (" + checkUser.error + ")";
              responseBody['token'] = undefined;
              callback(responseBody);
            }
          }); // End checkCB
  }

  const registerAgent = () => {
    if (input.domain_agent_id) {
      // get agent
    } else if (input.email) {

    }
    if (isStringVariableSet(info.email) && isStringVariableSet(info.password)) { // Requires username and password
      if (validateEmail(info.email)) {
        if (process.env.NODE_ENV !== "test") {
          checkUser(info.email, function(checkUserCB) {
            if (checkUserCB.message == "Yes") { // User Registered
              if (checkUserCB.user.usertype == info.usertype) { // Usertype matches
                if (checkUserCB.user.emailVerified == true) { // User registered and can log in
                  // But first lets verify the password
                  if (isStringVariableSet(info.password)) {
                    if (info.password !== null) {
                      const dummyAgentPassword = crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update("123456789").digest('hex')
                      const passwordFromAgent = crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(info.password).digest('hex');
                      if (isStringVariableSet(checkUserCB["user"]["password"])) {
                        if (passwordFromAgent == checkUserCB["user"]["password"]) { // It's a MATCH
                          responseBody['message'] = "Done";
                          if (checkUserCB["user"]["token"] !== undefined) responseBody['token'] = checkUserCB["user"]["token"];
                          if (isStringVariableSet(checkUserCB["user"]["firstname"])) responseBody["firstname"] = checkUserCB["user"]["firstname"];
                          if (isStringVariableSet(checkUserCB["user"]["lastname"])) responseBody["lastname"] = checkUserCB["user"]["lastname"];
                          callback(responseBody);
                        } else { // Password not matching in database
                          if (passwordFromAgent == dummyAgentPassword) {
                            console.log('Dummy password used')
                            responseBody['message'] = 'Done'
                            if (checkUserCB["user"]["token"] !== undefined) responseBody['token'] = checkUserCB["user"]["token"];
                            if (isStringVariableSet(checkUserCB["user"]["firstname"])) responseBody["firstname"] = checkUserCB["user"]["firstname"];
                            if (isStringVariableSet(checkUserCB["user"]["lastname"])) responseBody["lastname"] = checkUserCB["user"]["lastname"];
                            callback(responseBody);
                          } else { // No matching dummy password so show error
                            console.log('No matching password to dummy password');
                            responseBody['message'] = 'Access Denied'
                            responseBody['token'] = undefined;
                            callback(responseBody);
                          }
                        }
                      } else { // No password stored in DB
                        responseBody['message'] = 'Access Denied'
                        responseBody['token'] = undefined;
                        callback(responseBody);
                      }
                    } else { // Password not specified
                      responseBody['message'] = 'Access Denied'
                      responseBody['token'] = undefined;
                      callback(responseBody);
                    }
                  } else { // Password not specified
                    responseBody['message'] = 'Access Denied'
                    responseBody['token'] = undefined;
                    callback(responseBody);
                  }
                } else { // User registered but email not verified
                  responseBody['message'] = "You must verify your email before proceeding";
                  responseBody['token'] = undefined;
                  callback(responseBody);
                }
              } else { // User exists but wrong usertype
                responseBody['message'] = 'Access Denied'
                responseBody['token'] = undefined;
                callback(responseBody);
              }
            } else if (checkUserCB.message == "No") {
              // User not registered
              // Make sure the user specifies the following variables
              var agentRecordDBParams = {
                TableName: process.env.DYNAMODB_USERS_TABLE,
                Item: {
                  email: info.email,
                  usertype: info.usertype,
                  agentstatus: 'pending',
                  id: generateUUID(info.firstname, info.lastname),
                  emailToken: crypto.createHash('md5').update("email=" + info.email + "&timestamp=" + new Date().getTime()).digest('hex'),
                  emailVerified: false,
                  password: crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(info.password).digest('hex'),
                  createdAt: new Date().getTime(),
                  updatedAt: new Date().getTime()
                }
              };
              // Optional fields (Agent):
              if (isStringVariableSet(info['firstname'])) agentRecordDBParams['Item']['firstname'] = info['firstname'];
              if (isStringVariableSet(info['lastname'])) agentRecordDBParams['Item']['lastname'] = info['lastname'];
              if (isStringVariableSet(info['contactnumber'])) agentRecordDBParams['Item']['contactnumber'] = info['contactnumber'];
              if (isStringVariableSet(info['preferredlanguage'])) agentRecordDBParams['Item']['preferredlanguage'] = info['preferredlanguage'];
              if (isStringVariableSet(info['agentexperience'])) agentRecordDBParams['Item']['agentexperience'] = info['agentexperience'];
              if (isStringVariableSet(info['company'])) agentRecordDBParams['Item']['company'] = info['company'];


              if (isStringVariableSet(info.suburbs) && isStringVariableSet(info.postcodes) && isStringVariableSet(info.agentlicense)) { // Agent license needs to exist
                agentRecordDBParams['Item']['postcodes'] = info.postcodes; // Add postcode
                agentRecordDBParams['Item']['suburbs'] = info.suburbs;
                agentRecordDBParams['Item']['agentlicense'] = info.agentlicense; // Add agentlicense to the input

                // User doesn't exist lets create
                dynamoDb.put(agentRecordDBParams, (error, result) => {
                  if (!error) { // Created (Dont send token)
                    // Build the email
                    var from_email = new helper.Email('support@agents.com.au', " Agents");
                    var to_email = new helper.Email(info.email.toString());
                    var mail = new helper.Mail();
                    mail.setFrom(from_email);
                    mail.setSubject('Please verify your email');
                    personalization  = new helper.Personalization();
                    personalization.addTo(to_email);
                    personalization.addSubstitution(
                      new helper.Substitution('-firstName-', info.firstname.toString()));
                    personalization.addSubstitution(
                      new helper.Substitution('-token-', agentRecordDBParams.Item['emailToken']));
                    personalization.addSubstitution(
                      new helper.Substitution('-email-', encodeURIComponent(info.email)));
                    mail.addPersonalization(personalization);
                    mail.setTemplateId('03ad4271-f629-42cd-b783-39c01b1cc4b6');

                    // Send off the email
                    var sg = require('sendgrid')(process.env.SENDGRID_API_KEY);
                    var request = sg.emptyRequest({
                      method: 'POST',
                      path: '/v3/mail/send',
                      body: mail.toJSON(),
                    });
                    sg.API(request, function(error, response) {
                      console.log(response.statusCode);
                      console.log(response.body);
                      console.log(response.headers);
                    });

                    // Done (Dont send a token)
                    responseBody['message'] = "Done";
                    responseBody['token'] = undefined; // No need to provide token for new user
                    callback(responseBody);
                  } else { // Not created
                    responseBody['message'] = "Cant create user record due to error (" + error.message + "). For support purposes, please quote RequestId: " + error.requestId + ". ";
                    responseBody['token'] = undefined;
                    callback(responseBody);
                  }
                });
              } else { // Postcode doesnt exist
                responseBody['message'] = "Requires a postcode and agentlicense to create an agent user";
                responseBody['token'] = undefined;
                callback(responseBody);
              }
            } else { // Undefined response
              callback(responseBody);
            }
          });
        } else { // In Test Mode
          responseBody['message'] = "Done";
          responseBody['token'] = undefined;
          callback(responseBody);
        }
      } else {
        responseBody['message'] = "Email does not appear to be valid";
        responseBody['token'] = undefined;
        callback(responseBody);
      }
    } else {
      responseBody['message'] = "Agent registration is missing parameters: email";
      responseBody['token'] = undefined;
      callback(responseBody);
    }
  }

  const registerSuperagent = () => {
    if (isStringVariableSet(info.email)) {
      if (validateEmail(info.email)) {
        responseBody['message'] = "Super Agent not implemented";
        responseBody['token'] = undefined;
        callback(responseBody);
      } else {
        responseBody['message'] = "Email does not appear to be valid";
        responseBody['token'] = undefined;
        callback(responseBody);
      }
    } else {
      responseBody['message'] = "Super Agent registration is missing the following parameter: email";
      responseBody['token'] = undefined;
      callback(responseBody);
    }
  }

  const registerAdmin = () => {
    if (isStringVariableSet(info.email)) {
      if (validateEmail(info.email)) {
        checkUser(info.email, function(checkUserCB) {
          if (checkUserCB.message == "Yes") { // User Registered
            if (checkUserCB.user.usertype == info.usertype) { // Usertype matches
              if (checkUserCB.user.emailVerified == true) { // User registered and can log in
                // But first lets verify the password
                if (isStringVariableSet(info.password)) {
                  if (info.password !== null) {
                    const passwordFromAdmin = crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(info.password).digest('hex');
                    if (isStringVariableSet(checkUserCB["user"]["password"])) {
                      if (passwordFromAdmin == checkUserCB["user"]["password"] ) {
                        responseBody['message'] = "Done";
                        if (checkUserCB["user"]["token"] !== undefined) responseBody['token'] = checkUserCB["user"]["token"];
                        callback(responseBody);
                      } else {
                        responseBody['message'] = "Access Denied";
                        responseBody['token'] = undefined;
                        callback(responseBody);
                      }
                    } else {
                      responseBody['message'] = "Access Denied";
                      responseBody['token'] = undefined;
                      callback(responseBody);
                    }
                  } else {
                    responseBody['message'] = "Access Denied";
                    responseBody['token'] = undefined;
                    callback(responseBody);
                  }
                } else {
                  responseBody['message'] = "Access Denied";
                  responseBody['token'] = undefined;
                  callback(responseBody);
                }
              } else {
                responseBody['message'] = "Access Denied";
                responseBody['token'] = undefined;
                callback(responseBody);
              }
            } else {
              responseBody['message'] = "Access Denied";
              responseBody['token'] = undefined;
              callback(responseBody);
            }
          } else {
            responseBody['message'] = "Access Denied";
            responseBody['token'] = undefined;
            callback(responseBody);
          }
        });
      } else {
        responseBody['message'] = "Email does not appear to be valid";
        responseBody['token'] = undefined;
        callback(responseBody);
      }
    } else {
      responseBody['message'] = "Admin registration is missing the following parameter: email";
      responseBody['token'] = undefined;
      callback(responseBody);
    }
  }

  switch (info.usertype) {
    case 'seller': return registerSeller()
    case 'agent': return registerAgent()
    case 'superagent': return registerSuperagent()
    case 'admin': return registerAdmin()
  }
}
