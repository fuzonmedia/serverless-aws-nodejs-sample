const debug = require('debug')('route::phone-verification')
const { fetchAgentListings } = require('./api')
const { get } = require('lodash')

const verifyTokenFunction = require('./verifytokenfunction');
const userDBUtils = require('./userDatabaseUtils');

const response = {
  message: 'Access Denied',
}
const defaultHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
}

/**
 * Contact verification from Twilo SMS or call
 *
 * @param {*} event
 * @param {*} context
 * @param {*} callback
 */
module.exports.get = (event, context, callback) => {

  context.callbackWaitsForEmptyEventLoop = false

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

  const token = event.queryStringParameters.token
  const verification_code = event.queryStringParameters.verification_code
  //Authy for twilio
  var authy = require('authy')(process.env.TWILIO_API_KEY);

  verifyTokenFunction(token, function (user) {

    if (user === null) {
      response({
        message: 'Access Denied',
        listings: []
      }, 403)
      return
    }
    console.log("user :" + JSON.stringify(user));

    if (typeof verification_code === 'undefined') {
      response({
        message: 'Error: verification code must be supplied'
      }, 400)
      return
    }

    // User already verified
    if (typeof user["result"]["mobile_verified"] !== 'undefined' && user["result"]["mobile_verified"]) {
      response({
        message: 'true'
      }, 200)
      return
    }

    // Call twilio to validate code
    authy.phones().verification_check(user["result"]["contactnumber"], process.env.PHONE_COUNTRY_CODE, verification_code, function (err, res) {
      if (err) {
        console.error(err);
        response({
          message: 'false'
        }, 500)
        return
      }

      if (!res.success) {
        console.log(res);
        response({
          message: 'false'
        }, 200)
        return
      }

      // Add database flag to update contact verified
      userDBUtils.updateUserRecord({ emailaddress: user["result"]["email"], changes: { mobile_verified: true } }, function (updateUserCB) {
        console.log("Update :" + JSON.stringify(updateUserCB));
        if (updateUserCB.message !== "Done") {
          console.error("User not updated");
          response({
            message: 'false'
          }, 500)
          return
        }

        response({
          message: 'true'
        }, 200)
        return
      });

    });
  })
}
