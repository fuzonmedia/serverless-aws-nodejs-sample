// import { story } from '../handler';

const debug = require('debug')('route::register')
// Register function
const crypto = require('crypto');

// Sendgrid stuff
var helper = require('sendgrid').mail;
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY);

const dynamoDb = require('./util/dynamodb')
const uuid = require('uuid');

const storyUtilsLib = require('./storyDatabaseUtils');
const createstoryRecord = storyUtilsLib.createstoryRecord;
const createstoryInsertData = storyUtilsLib.createstoryInsertData;

const { checkUser, checkUserByField } = require('./userDatabaseUtils')
const { fetchAgentAndCheck } = require('./domainApiUtils')
const { fetchAgent } = require('./api')
const { pick, omit, has } = require('lodash')

const jwt = require('jsonwebtoken')

// Actual module code
module.exports = function (info, callback) {

  var responseBody = {};

  debug('input data: ' + JSON.stringify(info))

  if (info.email) {
    debug(`Email provided: [${info.email}]`)
    checkUser(info.email).then(check => {
      if (check) {
        debug('User found in database. Proceeding with login.')
        loginUser(check);
        return
      }

      //Call the appropriate function based on usertype
      switch (info.usertype) {
        case "seller":
          debug('Proceeding with seller registration')
          registerSeller();
          break;
        case "agent":
          debug('Proceeding with agent registration')
          registerAgent();
          break;
        default:
          debug(`Bad request. Invalid usertype: [${info.usertype}]`)
          responseBody['message'] = "Registration requires a user type";
          callback(responseBody);
      }
    })
  } else if (info.domain_agent_id && info.usertype === 'agent') {
    debug(`Domain Agent ID provided: [${info.domain_agent_id}]`)
    registerAgent();
  } else {
    debug('Bad request. Neither email nor Agent ID provided.')
    responseBody['message'] = "Email address required.";
    callback(responseBody);
  }

  /**
   * Login, any usertype
   */
  function loginUser(user) {
    if (!user.emailVerified) {
      responseBody['message'] = "You must verify your email before proceeding.";
      return callback(responseBody);
    }
    if (!info.password) {
      responseBody['message'] = 'Password required';
      return callback(responseBody);
    }
    if (!user.password) {
      responseBody['message'] = 'Please contact support to reset your password.';
      return callback(responseBody);
    }

    const passwordFromUser = crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(info.password.toString()).digest('hex');

    if (passwordFromUser != user.password) {
      responseBody['message'] = 'Invalid password';
      return callback(responseBody);
    }

    responseBody['message'] = 'Done';
    responseBody.user = omit(user, ['password', 'emailtoken']);

    const claims = {
      sub: user.id,
      aud: `${process.env.APP_HOST}:${user.usertype}`,
      given_name: user.firstname,
      family_name: user.lastname,
      email: user.email,
    }

    const token = jwt.sign(claims, process.env.PASSWORD_SECRET_SALT, { expiresIn: '1y' })
    responseBody.user.token = token
    callback(responseBody);
  }

  /**
   * New user, usertype = seller
   */
  function registerSeller() {
    const missing = [
      'email',
      'password',
      'firstname',
      'lastname',
      'contactnumber'
    ].reduce(
      (result, value) => {
        if (!has(info, value)) result.push(value)
        return result
      }, []
    )

    if (missing.length > 0) {
      responseBody['message'] = `Missing required registration parameters: ${missing.join(', ')}.`;
      return callback(responseBody)
    }

    const userRecord = createSellerRecord(info)
    const storyRecord = createstoryInsertData(info, userRecord.id)

    if (storyRecord === null) {
      debug('Missing required story params')
      responseBody['message'] = "Missing required story parameters: property.postcode, property.city";
      return callback(responseBody)
    }

    const errors = []

    debug('Validation passed.')

    debug('STEP 1: Saving user to Database')

    dynamoDb.putAsync({
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Item: userRecord
    }).catch(error => {
      throw new Error('User record not created.')
    }).then(result => {

      debug('STEP 2: Checking Domain Agent ID')

      let fetchAgentPromise
      if (storyRecord.requestedAgent && storyRecord.requestedAgent.domain_agent_id) {
        let domain_agent_id = storyRecord.requestedAgent.domain_agent_id
        debug('Domain Agent ID detected. Constructing API fetch promise.')
        fetchAgentPromise = fetchAgent(domain_agent_id).then(agent => {
          if (agent === null) {
            console.log('Agent Not Found in Domain API. Could not get name and email.')
            return null
          }
          debug(`Found agent: ${JSON.stringify(agent)}`)
          return agent
        })
      } else {
        fetchAgentPromise = new Promise(resolve => resolve(null))
      }

      return fetchAgentPromise
    }).then(agent => {

      debug('STEP 3: Storing story Record')

      let storyNotification = null
      if (agent) {
        debug(`Storing agent email and name: ${agent.email} ${agent.firstName} ${agent.lastName}`)
        storyNotification = agent.email
        storyRecord.requestedAgent.email = agent.email
        storyRecord.requestedAgent.name = `${agent.firstName} ${agent.lastName}`.trim()
        storyRecord.requestedAgent.domain_agent_id = agent.agentId
      }

      return dynamoDb.putAsync({
        TableName: process.env.DYNAMODB_storyS_TABLE,
        Item: storyRecord,
      }).catch(error => {
        // console.error(error);
        // responseBody['message'] = "story record not created.";
        // callback(responseBody)
        // return
        console.error('Unable to create story record')
        errors.push("story record not created.")
        return null
      }).then(() => {

        debug('STEP 3.1: Sending story notification')

        if (!storyRecord.requestedAgent || !storyRecord.requestedAgent.domain_agent_id) return
        checkUserByField('domain_agent_id', storyRecord.requestedAgent.domain_agent_id).then(user => {
          if (user === null) {
            //TODO agent not registered
          } else {
            const sendNotificationMail = require('./storyDatabaseUtils').sendNotificationMail
            // This is going in background.
            // Notification email to existing agent
            const sandbox = process.env.APP_ENV !== 'production'
            sendNotificationMail(storyRecord, [user], sandbox).catch(() => {
              errors.push('Unable to send notification to agent.')
            })
          }
        })
      })
    }).then(() => {

      debug('STEP 4: Sending verification email')

      return sendVerificationEmail(userRecord.emailToken, userRecord).catch(e => {
        throw new Error('Error sending verification email. Please try again')
      })
    }).then(() => {

      debug('STEP 5: Sending phone verification')

      SendPhoneVerification(userRecord.contactnumber, 'sms')

      const text = "New seller sign up from *" + userRecord.firstname +
        " " + userRecord.lastname + "*\n*Email:* " +
        userRecord.email + "\n*Phone:* " +
        userRecord.contactnumber + "\n*Address:* " +
        storyRecord.property.address1 + "\n" + storyRecord.property.city + " " +
        storyRecord.property.state + " " + storyRecord.property.postcode;

      debug('STEP 6: Sending slack verification')
      SlackNotification(text)
    }).then(() => {
      debug('STEP 7: All done')
      responseBody.errors = errors
      responseBody['message'] = "Done"
      callback(responseBody)
    }).catch(e => {
      debug(`Error: ${JSON.stringify(e)}`)
      responseBody['message'] = e.message
      callback(responseBody);
    })
  }

  /**
   * Creates user record to insert into user database
   */
  function createSellerRecord(info) {
    const timestamp = new Date().getTime();
    const recordToInsert = {
      email: info.email,
      usertype: info.usertype,
      id: uuid.v1(),
      emailToken: crypto.createHash('md5').update("email=" + info.email + "&timestamp=" + timestamp).digest('hex'),
      emailVerified: false,
      password: crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update('' + info.password).digest('hex'),
      firstname: info.firstname,
      lastname: info.lastname,
      contactnumber: info.contactnumber,
      createdAt: timestamp,
      updatedAt: timestamp,
      mobile_verified: false
    };
    if (info.languages) {
      recordToInsert.languages = info.languages;
    }
    
    return recordToInsert
  }

  /**
  * New user, usertype = agent
  */
  function registerAgent() {
    const requiredInput = pick(info, [
      'password',
      'company',
      'suburbs',
      'postcodes',
      'agentlicense',
    ])

    if (Object.keys(requiredInput).length !== 5) {
      responseBody['message'] = "Missing required registration parameters: password, company, suburbs, postcodes, agentlicense";
      callback(responseBody);
      return
    }

    function getDataFromInput() {
      const agentData = pick(info, [
        'email',
        'firstname',
        'lastname',
        'contactnumber',
      ])
      if (Object.keys(agentData).length !== 4) {
        throw new Error("Missing required registration parameters: email, firstname, lastname, contactnumber")
        callback(responseBody);
        return null
      }
      return agentData
    }

    let fetchAgentPromise
    if (info.domain_agent_id) {
      debug('Domain Agent ID detected. Constructing API fetch promise.')
      fetchAgentPromise = fetchAgentAndCheck(info.domain_agent_id).catch(e => {
        console.log(e)
        responseBody.message = `Error: ${e.message}`
        return callback(responseBody)
      })
    } else {
      fetchAgentPromise = new Promise(resolve => resolve(getDataFromInput()))
    }

    fetchAgentPromise.then(agent => agent ? createAgentRecord(agent, function (userRecordToInsert) {
      debug('Saving user to database')
      debug(`DB query: ${JSON.stringify(userRecordToInsert)}`)
      return dynamoDb.putAsync(userRecordToInsert).then(() => {
        const text = `New agent sign up from *${agent.firstname} ${agent.lastname}*
          *Email:* ${agent.email}
          *Phone:* ${agent.contactnumber}
          *Agency:* ${info.company}
          *Agent License:* ${info.agentlicense}
          *Suburbs:* ${info.suburbs}`

        SlackNotification(text);
        sendVerificationEmail(userRecordToInsert.Item.emailToken, agent)
        // .catch(e => {
        //   debug('Error sending verification email')
        //   debug(e)
        // });
        responseBody['message'] = "Done";
        callback(responseBody);
      }).catch(error => {
        console.error(error);
        responseBody['message'] = "User record not created.";
        callback(responseBody);
      })
    }) : null).catch(e => {
      responseBody['message'] = `Error: ${e.message}`
      callback(responseBody);
    })
  }

  /**
   * Creates agent record to insert into user database
   */
  function createAgentRecord(agentData, callback) {
    debug(`Creating agent from input and provided data: ${JSON.stringify(agentData)}`)
    var agentRecordDBParams = {
      TableName: process.env.DYNAMODB_USERS_TABLE,
      Item: {
        domain_agent_id: agentData.domain_agent_id,
        email: agentData.email,
        usertype: info.usertype,
        agentstatus: 'pending',
        id: generateUUID(agentData.firstname, agentData.lastname),
        emailToken: crypto.createHash('md5').update("email=" + agentData.email + "&timestamp=" + new Date().getTime()).digest('hex'),
        emailVerified: false,
        password: crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(info.password).digest('hex'),
        firstname: agentData.firstname,
        lastname: agentData.lastname,
        contactnumber: agentData.contactnumber,
        company: info.company,
        suburbs: info.suburbs,
        postcodes: info.postcodes,
        agentlicense: info.agentlicense,
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
        profilephoto: agentData.profilephoto,
        biography: agentData.biography,
        domain_agency_data: agentData.domain_agency_data
      }
    }
    callback(agentRecordDBParams);
  }

  /**
   * Send verification email via sendgrid
   */
  function sendVerificationEmail(emailToken, { email, firstname } = {}) {
    if (!emailToken) {
      throw new Error('Token required')
    }

    if (!email || !firstname) {
      email = info.email
      firstname = info.firstname
    }

    let templateId
    if (info.usertype == 'seller') {
      templateId = 'b370d730-3733-4f13-afed-d5b5b9a9a7d4'
    } else if (info.usertype == 'agent') {
      templateId = '03ad4271-f629-42cd-b783-39c01b1cc4b6'
    }

    const { send } = require('./util/sendgrid')

    return send({
      to: email.toString(),
      subject: 'Please verify your email',
      substitutions: {
        '-firstName-': firstname,
        '-token-': emailToken,
        '-email-': encodeURIComponent(email),
      },
      templateId,
    })
  }
};

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

function SlackNotification(text) {

  debug(`Sending Slack notification`)

  var IncomingWebhook = require('@slack/client').IncomingWebhook;
  var url = process.env.SLACK_WEBHOOK_URL || '';

  if (url === '') return

  var webhook = new IncomingWebhook(url);

  webhook.send(text, function (err, res) {
    if (err) {
      console.error('Error:', err);
    }
    debug('Sent Slack notification')
  })

  debug('Slack: done')
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

// Twilio phone verification
function SendPhoneVerification(phoneNumber, method) {
  // Authy for twilio
  var authy = require('authy')(process.env.TWILIO_API_KEY);

  let phoneType
  authy.phones().info(phoneNumber, process.env.PHONE_COUNTRY_CODE, function (err, res) {
    if (err) {
      console.error('Error:', err);
      return
    }

    phoneType = res.type
  });

  if (phoneType !== 'cellphone') {
    console.log('Can\'t verify a non-mobile')
    return
  }

  authy.phones().verification_start(phoneNumber, process.env.PHONE_COUNTRY_CODE, method, function (err, res) {
    if (err) {
      console.error('Error:', err);
    }

  });

}
