const debug = require('debug')('password-reset')
const { get, each } = require('lodash');
const qs = require('querystring');
const AWS = require('aws-sdk');
const bluebird = require('bluebird');
const dynamoDb = bluebird.promisifyAll(new AWS.DynamoDB.DocumentClient());
const uuid = require('uuid/v4');
const crypto = require('crypto');
const SendGrid = require('sendgrid')
const sg = SendGrid(process.env.SENDGRID_API_KEY);
const { parse: parseRequest } = require('./util/body-parser')



const { updateUserRecord } = require('./userDatabaseUtils')

const defaultHeaders = {
    "Access-Control-Allow-Origin" : "*",
    "Access-Control-Allow-Credentials" : true,
};

const TableName = 'agentsPasswordResetTokens';

module.exports.generateToken = (event, context, callback) => {
    debug('Received generateToken request')
    
    function response(body, statusCode, headers = {}) {
        if (typeof body !== 'string') {
            body = JSON.stringify(body)
            headers['Content-Type'] = 'application/json'
        }
        return callback(null, {
            statusCode,
            body,
            headers: Object.assign(defaultHeaders, headers),
        })
    }

    const { body } = parseRequest(event)
    const { email } = body

    debug(`Input: email [${email}]`)

    // Validation
    // TODO use validation library here and in all parts of code
    if (typeof email === 'undefined' || email.length === 0) {
        debug('Empty email')
        response({
            message: "Email is empty"
        }, 500) //422
    }

    function createToken(created) {
        const token = uuid()
        debug(`Attempting to store token [${token}] to DynamoDB`)
        return dynamoDb.putAsync({
            TableName,
            Item: {
                email,
                token,
                ttl: created + 3600 * 24,
                created,
            },
        }).then(() => {
            debug('Token stored successfully')
            return response('', 200) //204
        })
    }

    const tokenRequest = {
      RequestItems: {
        [TableName]: {
          Keys: {
            email,
          },
        },
      }
    }

    debug(`Requesting previous tokens: ${JSON.stringify(tokenRequest)}`)
    Promise.all([
      dynamoDb.batchGetAsync(tokenRequest).catch(e => {
        debug('DynamoDB error. Unable to check previous tokens')
        debug(e.message)
        return null
      }),
      // User request
      dynamoDb.queryAsync({
        TableName: "agentsUsers",
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {':email': email},
      }).catch(e => {
        debug('DynamoDB error. Unable to check users')
        debug(e.message)
        return {Count: 0}
      }),
    ]).then(([tokenData, userData]) => {

      if (userData.Count === 0) {
        debug(`User with email [${email}] not found`)
        return response('', 200) //204
      }
        const now = Math.floor(Date.now() / 1000) // Remove milliseconds

        if (tokenData === null) {
            debug('No previous tokens found')
            // No tokens created before. Proceed to store.
            return createToken(now)
        }

        let withinHour = 0

        debug(`Fetched ${tokenData.Response.length} tokens from DB`)
        for (let token of tokenData.Responses) {

            // Token is missing
            if (!token) continue;

            // Token is expired
            if (token.ttl > now) continue;

            if (token.created > (now - 300)) {
                return response({
                    message: 'Please, wait 5 minutes between requests',
                }, 500) //429
            }

            if (token.created > (now - 3600) && (++withinHour >= 3)) {
                return response({
                    message: 'More than 3 requests within an hour',
                }, 500) //429
            }
        }

        debug('No issues. Creating token')
        return createToken(now)
    })
}

module.exports.reset = (event, context, callback) => {
    function response(body, statusCode, headers = {}) {
        if (typeof body !== 'string') {
            body = JSON.stringify(body)
            headers['Content-Type'] = 'application/json'
        }
        callback(null, {
            statusCode,
            body,
            headers: Object.assign(defaultHeaders, headers),
        })
    }

    const { body } = parseRequest(event)
    const { email, token, password } = body

    // Validation
    // TODO use validation library here and in all parts of code
    debug('Validating input')
    if (typeof email === 'undefined' || email.length === 0) {
        response({
            message: "Email is empty"
        }, 500) //422
    }
    if (typeof token === 'undefined' || token.length === 0) {
        response({
            message: "Token is empty"
        }, 500) //422
    }
    if (typeof password === 'undefined' || password.length === 0) {
        response({
            message: "Password is empty"
        }, 500) //422
    }

    debug('Input validated')
    Promise.all([
        // Token request
        dynamoDb.getAsync({
            TableName,
            Key: {
                email,
                token,
            },
        }),
        // User request
        dynamoDb.queryAsync({
            TableName: "agentsUsers",
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {':email': email},
         }),
    ]).then(([tokenData, userData]) => {
        if (tokenData === null || userData.Count === 0) {
            // Either user or token is missing.
            return response({
                message: "Invalid credentials"
            }, 500) //422
        }

        const now = Math.floor(Date.now() / 1000)

        if (tokenData.Item.ttl < now) {
          return response({
                message: "Token expired"
            }, 500) //401
        }

        const encryptedPassword = crypto.createHmac('sha1', process.env.PASSWORD_SECRET_SALT).update(password).digest('hex');

        return updateUserRecord({
            emailaddress: email,
            changes: {
                password: encryptedPassword,
            }
        }, ({ message, result }) => {
            if (message === 'Done') {
                return response('', 200)
            }

            return response('', 500)
        })
    })
}

/**
 * Triggered by DynamoDB stream on agentsPasswordResetTokens table
 * 
 * @param {*} event 
 * @param {*} context 
 * @param {*} callback 
 */
module.exports.mail = (event, context, callback) => {
    record = event.Records[0]
    if (record.eventName !== "INSERT") {
        callback(null, 400)
        return
    }

    const { Email, Mail, Personalization, Substitution } = SendGrid.mail
    const { email, token } = record.dynamodb.NewImage

    const mail = new Mail()
    mail.setFrom(new Email('support@agents.com.au', " Agents"))

    const data = new Personalization()
    data.addTo(new Email(email.S))
    data.setSubject('Link to reset your password')
    data.addSubstitution(new Substitution('-resettoken-', token.S))
    data.addSubstitution(new Substitution('-resetemail-', email.S))

    mail.setTemplateId('8a2da736-0d3b-426d-b5cf-c7b1488a6281')
    mail.addPersonalization(data)

    const request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: mail.toJSON(),
    })

    debug(`Sending SG request: ${JSON.stringify(request)}`)
    sg.API(request).then(response => {
        debug(`Mail successfully sent: ${JSON.stringify(response)}`)
        callback(null, response.statusCode)
    }).catch(error => {
        debug(`Error sending email: ${error.message}`)
        callback(null, {error})
    })
}
