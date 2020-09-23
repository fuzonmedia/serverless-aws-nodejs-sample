'use strict';
const registerLib = require('./lib/register');
const register2Lib = require('./lib/register2');
const interviewLib = require('./lib/interview');
const storyPhotoLib = require('./lib/storyphoto');
const proposalLib = require('./lib/proposal');
const shortlistLib = require('./lib/shortlist').lib; // New way of doing things
const salesLib = require('./lib/sales'); // New way of doing things
const messagesLib = require('./lib/messages'); // New way of doing things
const verifyemaillib = require('./lib/verifyemail'); // New way of doing things
const propertylib = require('./lib/property');
const setPhotoStatusLib = require('./lib/setPhotoStatus'); // Set Photo Status
const verifyTokenLib = require('./lib/verifytoken');
const { usersLib } = require('./lib/users');
const profileLib = require('./lib/profile'); // Profile library
const reviewLib = require('./lib/review'); // Review Library
const parambyname = require('./lib/parambyname');

// Default response (Visible by all modules)
var response = {
  statusCode: 500,
  headers: {
    "Access-Control-Allow-Origin": "*", // Required for CORS support to work
    "Access-Control-Allow-Credentials": true // Required for cookies, authorization headers with HTTPS
  },
  body: JSON.stringify({
    message: "No response provided"
  })
};

const { parse: parseRequest } = require('./lib/util/body-parser')

// THIS MUST BE DEPRECATED
function deparam(params, coerce) {
  var obj = {},
    coerce_types = { 'true': !0, 'false': !1, 'null': null };

  // Iterate over all name=value pairs.
  params.replace(/\+/g, ' ').split('&').forEach(function (v, j) {
    var param = v.split('='),
      key = decodeURIComponent(param[0]),
      val,
      cur = obj,
      i = 0,

      // If key is more complex than 'foo', like 'a[]' or 'a[b][c]', split it
      // into its component parts.
      keys = key.split(']['),
      keys_last = keys.length - 1;

    // If the first keys part contains [ and the last ends with ], then []
    // are correctly balanced.
    if (/\[/.test(keys[0]) && /\]$/.test(keys[keys_last])) {
      // Remove the trailing ] from the last keys part.
      keys[keys_last] = keys[keys_last].replace(/\]$/, '');

      // Split first keys part into two parts on the [ and add them back onto
      // the beginning of the keys array.
      keys = keys.shift().split('[').concat(keys);

      keys_last = keys.length - 1;
    } else {
      // Basic 'foo' style key.
      keys_last = 0;
    }

    // Are we dealing with a name=value pair, or just a name?
    if (param.length === 2) {
      val = decodeURIComponent(param[1]);

      // Coerce values.
      if (coerce) {
        val = val && !isNaN(val) ? +val              // number
          : val === 'undefined' ? undefined         // undefined
            : coerce_types[val] !== undefined ? coerce_types[val] // true, false, null
              : val;                                                // string
      }

      if (keys_last) {
        // Complex key, build deep object structure based on a few rules:
        // * The 'cur' pointer starts at the object top-level.
        // * [] = array push (n is set to array length), [n] = array if n is
        //   numeric, otherwise object.
        // * If at the last keys part, set the value.
        // * For each keys part, if the current level is undefined create an
        //   object or array based on the type of the next keys part.
        // * Move the 'cur' pointer to the next level.
        // * Rinse & repeat.
        for (; i <= keys_last; i++) {
          key = keys[i] === '' ? cur.length : keys[i];
          cur = cur[key] = i < keys_last
            ? cur[key] || (keys[i + 1] && isNaN(keys[i + 1]) ? {} : [])
            : val;
        }

      } else {
        // Simple key, even simpler rules, since only scalars and shallow
        // arrays are allowed.

        if (Array.isArray(obj[key])) {
          // val is already an array, so push on the next value.
          obj[key].push(val);

        } else if (obj[key] !== undefined) {
          // val isn't an array, but since a second value has been specified,
          // convert val into an array.
          obj[key] = [obj[key], val];

        } else {
          // val is a scalar.
          obj[key] = val;
        }
      }

    } else if (key) {
      // No value was defined, so set something meaningful.
      obj[key] = coerce
        ? undefined
        : '';
    }
  });

  return obj;
}

module.exports.getNotSupported = (event, context, callback) => {
  response.statusCode = 400;
  response.body = JSON.stringify({
    message: 'Only HTTP post is accepted by this endpoint'
  });

  callback(null, response);
};

/**
 * Seems to be deprecated - see register2
 *
 * @param {*} event
 * @param {*} context
 * @param {*} callback
 */
module.exports.register = (event, context, callback) => {
  if (event.httpMethod !== 'POST') {
    callback(new Error('Invalid method type'));
    return;
  }

  const { body } = parseRequest(event)

  // Call Register Library
  registerLib(body, function (cb) {
    if (cb.message != "Done") {
      response.statusCode = 400;
      response.body = JSON.stringify({
        message: cb.message
      });
      callback(null, response);
    } else {
      response.statusCode = 200;
      response.body = JSON.stringify(cb);
      callback(null, response);
    }
  });
};

module.exports.register2 = (event, context, callback) => {
  if (event.httpMethod !== 'POST') {
    callback(new Error('Invalid method type'));
    return;
  }

  context.callbackWaitsForEmptyEventLoop = false

  const { body } = parseRequest(event)

  // Call Register Library
  register2Lib(body, function (cb) {

    console.log('Returned from register2')

    if (cb.message !== "Done") {
      response.statusCode = 400;
      response.body = JSON.stringify({
        message: cb.message
      });
      callback(null, response);
    } else {
      response.statusCode = 200;
      response.body = JSON.stringify(cb);
      callback(null, response);
    }
  });
};

module.exports.interview = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false
  var params = event.body;
  if (params) params = deparam(params);
  interviewLib({ entrypoint: event.httpMethod, httpGETRequest: event.queryStringParameters, httpPOSTBody: params },
    function (cb) {
      if (cb.message == "Done") {
        response.statusCode = 200;
        var bodyResponse = { message: cb.message };
        if (cb.result !== undefined) bodyResponse.result = cb.result;
        response.body = JSON.stringify(bodyResponse);
      } else {
        response.statusCode = 400;
        response.body = JSON.stringify({ message: cb.message });
      }
      callback(null, response);
    });
}

module.exports.storyphoto = (event, context, callback) => {
  var params = deparam(event.body, true);
  storyPhotoLib(params, function (cb) {
    if (cb.message != "Done") {
      response.statusCode = 400;
      callback(null, response);
    } else {
      response.statusCode = 200;
      response.body = JSON.stringify(cb);
      callback(null, response);
    }
  });
}


module.exports.proposal = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false
  var proposalParams = {
    entrypoint: event.httpMethod,
    token: 'fillmein',
    httpGETRequest: event.queryStringParameters,
  };
  if (event.httpMethod == 'GET') {
    if (event.queryStringParameters !== undefined) {
      if (event.queryStringParameters !== null) {
        if (event.queryStringParameters.token !== undefined) proposalParams.token = event.queryStringParameters.token;
      }
    }
  } else if (event.httpMethod == 'POST') {
    if (event.body !== undefined) {
      if (event.body !== null) {
        var params = deparam(event.body);
        proposalParams.token = params.token;
        for (var key in params) {
          proposalParams[key] = params[key];
        }
      }
    }
  }

  proposalLib(proposalParams, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.libraryInput !== undefined) bodyResponse.libraryInput = cb.libraryInput;
    if (cb.message == "Done") {
      response.statusCode = 200;
      if (cb.proposals !== undefined) bodyResponse.proposals = cb.proposals;
      if (cb.result !== undefined) bodyResponse.result = cb.result;
      response.body = JSON.stringify(bodyResponse);
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify(bodyResponse);
    }
    callback(null, response);
  });
}

module.exports.shortlist = (event, context, callback) => {

  context.callbackWaitsForEmptyEventLoop = false

  var shortlistParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: event.body
  };
  shortlistLib(shortlistParams, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.debug !== undefined) bodyResponse.debug = cb.debug;
    if (cb.shortlist !== undefined) bodyResponse.shortlist = cb.shortlist;
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}
module.exports.sales = (event, context, callback) => {
  var salesParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: event.body
  };
  context.callbackWaitsForEmptyEventLoop = false
  salesLib(salesParams, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.sales !== undefined) bodyResponse.sales = cb.sales;
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}
module.exports.messages = (event, context, callback) => {
  var messagesParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: event.body
  }
  messagesLib(messagesParams, function (cb) {
    // Note the difference between message and messages (confusing!)
    var bodyResponse = { message: cb.message };
    if (cb.messages !== undefined) bodyResponse.messages = cb.messages;
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    if (cb.canmessage !== undefined) bodyResponse.canmessage = cb.canmessage;
    if (cb.delivered !== undefined) bodyResponse.delivered = cb.delivered;
    if (cb.error !== undefined) bodyResponse.error = cb.error;
    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}

module.exports.verifyemail = (event, context, callback) => {
  var verifyemailParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: event.body
  }
  verifyemaillib(verifyemailParams, function (cb) {
    var bodyResponse = { message: cb.message };

    if (cb.identifier !== undefined) bodyResponse.identifier = cb.identifier;
    if (cb.token !== undefined) bodyResponse.token = cb.token;
    if (cb.firstname !== undefined) bodyResponse.firstname = cb.firstname;
    if (cb.lastname !== undefined) bodyResponse.lastname = cb.lastname;
    if (cb.profilephoto !== undefined) bodyResponse["profilephoto"] = cb.profilephoto;
    if (cb.usertype !== undefined) bodyResponse["usertype"] = cb.usertype;

    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}
module.exports.property = (event, context, callback) => {
  var propertyParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: event.body
  };
  response.statusCode = 400;
  propertylib(propertyParams, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.property !== undefined) bodyResponse.property = cb.property;
    if (cb.s3info !== undefined) bodyResponse.s3info = cb.s3info;
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }

    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}

module.exports.verifytoken = (event, context, callback) => {
  var verifyTokenParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: event.body
  };
  verifyTokenLib(verifyTokenParams, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.identifier !== undefined) bodyResponse.identifier = cb.identifier;
    if (cb.usertype !== undefined) bodyResponse.usertype = cb.usertype;
    if (cb.firstname !== undefined) bodyResponse["firstname"] = cb.firstname;
    if (cb.lastname !== undefined) bodyResponse["lastname"] = cb.lastname;
    if (cb.profilephoto !== undefined) bodyResponse["profilephoto"] = cb.profilephoto;

    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}

module.exports.setphotostatus = (event, context, callback) => {
  var setPhotoStatusParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: event.body
  };
  setPhotoStatusLib(setPhotoStatusParams, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}

module.exports.users = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false

  var params = event.body;
  if (params) params = deparam(params);
  var usersLibParams = {
    entrypoint: event.httpMethod,
    httpGETRequest: event.queryStringParameters,
    httpPOSTBody: params
  };
  usersLib(usersLibParams, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    if (cb.users !== undefined) bodyResponse.users = cb.users;
    if (cb.s3info !== undefined) bodyResponse.s3info = cb.s3info;
    if (cb.result !== undefined) bodyResponse.result = cb.result;
    if (cb.debug !== undefined) bodyResponse.debug = cb.debug;
    if (cb.useridentifier !== undefined) bodyResponse.useridentifier = cb.useridentifier;

    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}

module.exports.profile = (event, context, callback) => {
  profileLib({ entrypoint: event.httpMethod, httpGETRequest: event.queryStringParameters, httpPOSTBody: event.body }, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    if (cb.userinfo !== undefined) bodyResponse.userinfo = cb.userinfo;

    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}

module.exports.review = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false
  reviewLib({ entrypoint: event.httpMethod, httpGETRequest: event.queryStringParameters, httpPOSTBody: event.body }, function (cb) {
    var bodyResponse = { message: cb.message };
    if (cb.message == "Done") {
      response.statusCode = 200;
    } else if (cb.message == "Access Denied") {
      response.statusCode = 401;
    } else {
      response.statusCode = 400;
    }
    if (cb.reviews !== undefined) bodyResponse.reviews = cb.reviews;
    if (cb.review !== undefined) bodyResponse.review = cb.review;
    if (cb.averageRating !== undefined) bodyResponse.averageRating = cb.averageRating;
    if (cb.communicationAverage !== undefined) bodyResponse.communicationAverageRating = cb.communicationAverage;
    if (cb.negotiationAverage !== undefined) bodyResponse.negotiationAverageRating = cb.negotiationAverage;
    if (cb.presentationAverage !== undefined) bodyResponse.presentationAverageRating = cb.presentationAverage;
    if (cb.customerServiceAverage !== undefined) bodyResponse.customerServiceAverageRating = cb.customerServiceAverage;
    if (cb.marketKnowledgeAverage !== undefined) bodyResponse.marketKnowledgeAverageRating = cb.marketKnowledgeAverage;
    if (cb.marketingStrategyAverage !== undefined) bodyResponse.marketingStrategyAverageRating = cb.marketingStrategyAverage;

    response.body = JSON.stringify(bodyResponse);
    callback(null, response);
  });
}
