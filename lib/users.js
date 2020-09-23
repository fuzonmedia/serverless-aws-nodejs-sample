const { get, omit } = require('lodash')

const debug = require('debug')('users')

const { fetchAgentAndCheck } = require('./domainApiUtils')
const verifyTokenFunction = require('./verifytokenfunction');

const userUtilsLib = require('./userDatabaseUtils')

var response = {
  message: "Access Denied"
}

const { use } = require('./util/http')
const { fetchUsersByField, checkUserByField } = require('./userDatabaseUtils')
const auth = require('./middleware/auth')
const cors = require('./middleware/cors')

module.exports.get = use(
  cors(), auth(),
  (req, res) => {
    const id = get(req.params, 'id')

    return checkUserByField('id', id).then(
      user => {
        if (!user) {
          return res.status(404).json({
            message: `User with id [${id}] not found.`
          })
        }

        res.json({
          message: 'Done',
          user,
        })
      }
    )
  }
)

module.exports.list = use(
  auth(),
  (req, res) => {
    const usertype = get(req.query, 'usertype', 'agent')

    fetchUsersByField('usertype', usertype).then(
      users => users.map(user => omit(user, ['password']))
    ).then(
      users => res.json({
        message: 'Done',
        usertype,
        users,
      })
    )
  }
)

module.exports.usersLib = function(info, callback) {

  console.log(info);

  if (info.entrypoint == "GET") {

  } else if (info.entrypoint == "POST") {
    if (info.httpPOSTBody) {
      var request = info.httpPOSTBody;
      if (request.token) {
        verifyTokenFunction(request.token, function(validTokenCB) {
          if (validTokenCB.result && validTokenCB.message == "Found") {
            if (validTokenCB.result.usertype == "admin") {
              if (request.emailaddress) {
                var acceptedVars = [
                  'agentstatus',
                  'agentlicense',
                  'firstname',
                  'lastname',
                  'profilephoto',
                  'biography',
                  'personal',
                  'company',
                  'videoprofile',
                  'contactnumber',
                  'postcodes',
                  'suburbs',
                  'languages',
                  'domain_agent_id',
                  'domain_agency_data',
                ];
                var updateUserRecordInput = {
                  emailaddress: request.emailaddress,
                  changes: {}
                };

                let promise
                if (request.domain_agent_id) {
                  promise = fetchAgentAndCheck(request.domain_agent_id).catch(e => {
                    console.log(e)
                    response.message = `Error: ${e.message}`;
                    return callback(response);
                  })
                } else {
                  // Empty promise
                  promise = new Promise(resolve => resolve({}))
                }

                promise.then(agentData => {
                  
                  debug(agentData)

                  Object.assign(updateUserRecordInput, agentData)
                  for (let key in request) {
                    if (acceptedVars.indexOf(key) >= 0) {
                      updateUserRecordInput.changes[key] = request[key];
                    }
                  }
                  userUtilsLib.updateUserRecord(updateUserRecordInput,  function(updateusercb) {
                    if (updateusercb.message !== undefined) response.message = updateusercb.message;
                    if (updateusercb.result !== undefined) response.result = updateusercb.result;
                    callback(response);
                  });
                });
              } else {
                response.message = "Missing required parameter: emailaddress";
                callback(response);
              }
            } else if (validTokenCB.result.usertype == "agent" ||   validTokenCB.result.usertype == "seller") {
              if (request.action == "profilephoto") {
                userUtilsLib.prepareforprofilepicupload({useridentifier: validTokenCB.result.id}, function(profilephotocb) {
                  response.message = profilephotocb.message;
                  response.s3info = profilephotocb.s3info;
                  response.useridentifier = validTokenCB.result.id;
                  callback(response);
                });
              } else if (request.action == "editprofile") {
                var updateUserRecordInput = {
                  emailaddress: validTokenCB.result.email,
                  changes: {}
                };
                var acceptedVars = ['firstname', 'lastname', 'profilephoto', 'biography', 'personal', 'company', 'videoprofile', 'contactnumber', 'languages', 'domain_agent_id'];
                for (key in request) {
                  if (acceptedVars.indexOf(key) >= 0) {
                    updateUserRecordInput.changes[key] = request[key];
                  }
                }
                userUtilsLib.updateUserRecord(updateUserRecordInput,  function(updateusercb) {
                  if (updateusercb.message !== undefined) response.message = updateusercb.message;
                  if (updateusercb.result !== undefined) response.result = updateusercb.result;
                  callback(response);
                });
              } else {
                response.message = "Invalid parameter: action";
                callback(response);
              }
            } else {
              response.message = "Access Denied";
              callback(response);
            }
          } else {
            response.message = "Access Denied";
            callback(response);
          }
        });
      } else {
        response.message = "Access Denied";
        callback(response);
      }
    } else {
      response.message = "Invalid request";
      callback(response);
    }
  } else {
    response.message = "Invalid method";
    callback(response);
  }
};
