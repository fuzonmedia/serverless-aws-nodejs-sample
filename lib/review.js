const { decode } = require('./util/body-parser')
const { get, has, forEach, reduce, pickBy } = require('lodash')

const debug = require('debug')('route::review')

const verifyTokenFunction = require('./verifytokenfunction');

const reviewsUtilsLib = require('./reviewsDatabaseUtils');
const requireToken = false;

const response = {
  message: "Access Denied",
}

module.exports = function (info, callback) {
  if (info.entrypoint == "GET") {
    if (!info.httpGETRequest || !info.httpGETRequest.identifier) {
      response.message = "Requires: 'identifier'"
      return callback(response)
    }

    return reviewsUtilsLib.fetchReviewsByUserId({
      useridentifier: info.httpGETRequest.identifier
    }, function (listreviewcb) {
      callback(listreviewcb);
    })
  } else if (info.entrypoint == "POST") {
    if (!info.httpPOSTBody) {
      debug('HTTP POST body missing')
      response.message = 'Access Denied'
      return callback(response)
    }

    const body = decode(info.httpPOSTBody)

    const token = get(body, 'token', null)

    if (!token && requireToken) {
      debug('Token param missing')
      response.message = 'Access Denied'
      return callback(response)
    }

    let check

    if (token) {
      debug('Verifying access token')
      check = verifyTokenFunction(token).then(user => {
        if (user === null) {
          debug('Invalid token')
          throw new Error('Access Denied')
        }

        if (user.usertype !== 'seller') {
          debug('Trying to submit a review for a non-seller')
          throw new Error('Access Denied')
        }

        debug(`Token verified. User ID: ${user.id}`)
        return user.id
      })
    } else if (!requireToken) {
      debug('Token not supplied and not required')
      check = new Promise(resolve => resolve(undefined))
    }

    return check.catch(e => {
      response.message = e.message
      return callback(response)
    }).then(id => {
      return validateReview(body, id).then(response => {
        debug(`Validation response: ${JSON.stringify(response)}`)
        if (response !== true) {
          debug(JSON.stringify(body))
          return callback(response);
        }

        return createReviewInput(body, id).then(input => {
          debug(`Final input: ${JSON.stringify(input)}`)
          reviewsUtilsLib.addReviewProperty(createReviewInput).then(result => {
            debug(`Review stored: ${JSON.stringify(result)}`)
            const response = pickBy(result)
            response.message = 'Done'
            callback(response)
            return
          }).catch(error => {
            debug(`Error: ${error.message}`)
            callback({
              message: 'Error',
              error,
            })
          })
        })
      })
    })
  } else {
    debug('Invalid method')
    response.message = "Invalid Method";
    callback(response);
  }

  function validateReview(body) {
    debug('Validating POST body')
    return new Promise(resolve => {
      if (!body.reviewedUserId && !body.agentemail && !body.domain_agent_id) {
        debug(JSON.stringify({
          body,
          noReviewedUserId: !body.reviewedUserId,
          noAgenteMail: !body.agentemail,
          noDomainAgentId: !body.domain_agent_id,
        }))
        response.message = "Missing required parameter: reviewedUserId/agentemail/domain_agent_id";
        return resolve(response);
      }

      const missing = reduce(
        [
          'address',
          'firstname',
          'lastname',
          'revieweremail',
          'communication',
          'presentation',
          'marketingStrategy',
          'marketKnowledge',
          'negotiation',
          'customerService',
        ],
        (result, value) => {
          if (!has(body, value)) {
            result.push(`Missing required parameter: ${value}`)
          }
          return result
        }, []
      )
      if (missing.length > 0) {
        response.message = `Missing required parameters: ${missing.join(', ')}.`;
        return resolve(response);
      }

      return resolve(true)
    })
  }

  function createReviewInput(body, reviewerId) {
    debug('Creating Review record')
    const createReviewInput = {
      reviewerFirstName: body.firstname,
      reviewerLastName: body.lastname,
      agentFirstName: get(body, "agentFirstName", null),
      agentLastName: get(body, "agentLastName", null),
      reviewerEmail: body.revieweremail,
      propertyAddress: body.address,
      soldMonth: get(body, "soldMonth", null),
      communicationRating: body.communication,
      presentationRating: body.presentation,
      marketingStrategyRating: body.marketingStrategy,
      marketKnowledgeRating: body.marketKnowledge,
      negotiationRating: body.negotiation,
      customerServiceRating: body.customerService,
      reviewedUserId: get(body, "reviewedUserId", null),
      reviewedEmail: get(body, "agentemail", ''),
      reviewedAgentDomainId: get(body, "domain_agent_id", null),
    };

    if (reviewerId) {
      createReviewInput.reviewerIdentifier = reviewerId;
    }

    if (body.review) {
      createReviewInput.ratingdescription = body.review;
    }
    if (body.reviewerSuburb) {
      createReviewInput.reviewerSuburb = body.reviewerSuburb;
    }

    let fetchAgent
    // Look up agent email from Domain if it wasn't supplied
    if (!createReviewInput.reviewedEmail && createReviewInput.reviewedAgentDomainId) {
      debug('Domain Agent ID detected. Constructing API fetch promise.')
      fetchAgent = require('./api').fetchAgent(createReviewInput.reviewedAgentDomainId)
        .then(agent => {
          if (agent === null) {
            console.log('Agent Not Found in Domain API. Could not get email.')
          } else {
            debug(`Found agent: ${JSON.stringify(agent)}`)
          }
          return agent
        })
    } else {
      fetchAgent = new Promise(resolve => resolve(null))
    }

    // Try to get the domain email if ID was supplied
    return fetchAgent.then(agent => {
      if (agent) {
        console.log(`Setting agent email to ${agent.email}`)
        createReviewInput.reviewedEmail = agent.email
      }

      return createReviewInput
    })
  }
}
