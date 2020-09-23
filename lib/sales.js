const debug = require('debug')('route::sales')
const verifyTokenFunction = require('./verifytokenfunction');
const userDBUtils = require('./userDatabaseUtils');

const moment = require('moment')

const { fetchAgentListings } = require('./api')
const { get } = require('lodash')

const response = {}

module.exports = function (info, callback) {
  console.log(info)
  if (
    info.entrypoint !== 'GET' ||
    typeof info.httpGETRequest === 'undefined' ||
    info.httpGETRequest === null ||
    typeof info.httpGETRequest.token === 'undefined'
  ) {
    response["message"] = "Invalid Method";
    response["sales"] = undefined;
    callback(response);
  }

  verifyTokenFunction(info.httpGETRequest.token).then(user => {
    if (user === null) {
      response["message"] = "Access Denied";
      response["sales"] = undefined;
      callback(response);
      return;
    }

    let agent_id

    // if (user.usertype === 'admin' && info.httpGETRequest.agent_id) {
    //   agent_id = info.httpGETRequest.agent_id
    // } else {
    //   agent_id = user.domain_agent_id
    // }

    agent_id = info.httpGETRequest.agent_id

    if (typeof agent_id === 'undefined') {
      response.message = 'Error: agent_id must be specified'
      response.sales = []
      callback(response)
      return
    }

    userQuery = {
      useridentifier: agent_id
    }

    // Find user by agent_id
    userDBUtils.getUserRecord(userQuery, function(usercb) {
      // const direct = get(event, 'query.direct', '0') === '1'

      user = usercb.result
      
      if (typeof user === 'undefined') {
        response.message = 'Error: no user found for user ID'
        response.listings = []
        callback(response)
        return
      }

      if (typeof user.domain_agent_id === 'undefined') {
        response.message = 'Error: no agent ID found for user ID'
        response.listings = []
        callback(response)
        return
      }

      domain_agent_id = user.domain_agent_id
      earliestSoldDate = moment().startOf('day').subtract(1, 'y').toISOString()

      debug(`Fetching sales for agent [${domain_agent_id}] with date filter ${earliestSoldDate}`)

      const pageSize = parseInt(get(info.httpGETRequest, 'pageSize', 25), 10)
      const page = parseInt(get(info.httpGETRequest, 'page', 1), 10)
      const offset = (page - 1) * pageSize
      const limit = offset + pageSize

      const params = {
        dateUpdatedSince: earliestSoldDate,
        limit,
      }

      fetchAgentListings(
        domain_agent_id,
        l => l.status === 'sold' && get(l, 'saleDetails.soldDetails.soldDate', earliestSoldDate) >= earliestSoldDate,
        params
      ).then(
        data => {
          debug(`Received data: ${data.length}`)
          response.message = 'Done'
          response.sales = data.slice(offset, limit)
          callback(response)
          return
        }
      ).catch(
        e => {
          console.log(e)
          response.message = 'Error'
          callback(response)
          return
        }
      )
    })
  })
}
