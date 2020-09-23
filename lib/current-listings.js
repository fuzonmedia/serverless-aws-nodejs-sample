const debug = require('debug')('route::current-listings')
const { fetchAgentListings } = require('./api')
const { get } = require('lodash')

const verifyTokenFunction = require('./verifytokenfunction');
const userDBUtils = require('./userDatabaseUtils');

const response = {
  message: 'Access Denied',
}
const defaultHeaders = {
  "Access-Control-Allow-Origin" : "*",
  "Access-Control-Allow-Credentials" : true,
}

/**
 * Retrieve current listings by agent ID
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
  const agent_id = event.queryStringParameters.agent_id

  verifyTokenFunction(token).then(user => {

    if (user === null) {
      response({
        message: 'Access Denied',
        listings: []
      }, 403)
      return
    }

    if (typeof agent_id === 'undefined') {
      response({
        message: 'Error: agent_id must be supplied',
        listings: []
      }, 400)
      return
    }

    userQuery = {
      useridentifier: agent_id
    }

    // Find user by agent_id
    userDBUtils.getUserRecord(userQuery, function(usercb) {
        user = usercb.result
        if (typeof user === 'undefined') {
          response({
            message: 'Error: no user found for user ID',
            listings: []
          }, 404)
          return
       }

        if (typeof user.domain_agent_id === 'undefined') {
          response({
            message: `Error: no agent ID found for user [${user.id}]`,
            listings: []
          }, 404)
          return
        }
      
        const domain_agent_id = user.domain_agent_id

        debug(`Fetching listings for agent with domain ID [${domain_agent_id}]`)

        const pageSize = parseInt(get(event.queryStringParameters, 'pageSize', 25), 10)
        const page = parseInt(get(event.queryStringParameters, 'page', 1), 10)
        const offset = (page - 1) * pageSize
        const limit = offset + pageSize

        const params = {
          limit,
        }

        return fetchAgentListings(
          domain_agent_id,
          l => l.status === 'live' || l.status === 'under offer',
          params
        ).then(
          data => {
            debug(`Received data: ${data.length}`)
            response({
              message: 'Done',
              listings: data.slice(offset, limit),
            }, 200)
          }
        ).catch(e => {
          console.log(e)
          response({
            message: 'Error',
          }, 500)
        })
    })
  })
}
