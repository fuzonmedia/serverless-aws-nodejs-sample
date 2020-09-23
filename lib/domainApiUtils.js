const debug = require('debug')('utils::domain')
const { each, get } = require('lodash')
const { fetchAgent, fetchAgency } = require('./api')
const { checkUserByField } = require('./userDatabaseUtils')

const getUserFieldsFromAgent = (agent) => {
  const data = {
    email: agent.email,
    firstname: agent.firstName,
    lastname: agent.lastName,
    contactnumber: agent.mobile,
    domain_agent_id: parseInt(agent.agentId),
    profilephoto: agent.photo,
    biography: agent.profileText,
  }

  // Don't set field if empty in Domain. We don't want to overwrite existing data in DynamoDB.
  if (agent.agentVideo) {
    data.videoprofile = agent.agentVideo
  }

  if (agent.agency) {
    data.domain_agency_data = {
      id: agent.agency.id,
      logo_standard: agent.agency.profile.agencyLogoStandard,
      logo_small: agent.agency.profile.agencyLogoSmall,
      website: agent.agency.profile.agencyWebsite,
    }
  } else {
    data.domain_agency_data = {}
  }

  return data
}

const fetchAgentAndCheck = (agent_id, allowed = {}) => {
  return new Promise((resolve, reject) => {
    fetchAgent(agent_id).then(agent => {
      if (agent === null) {
        debug('Agent Not Found in Domain API database.')
        return reject(new Error('Agent ID not found.'))
      }
      debug(`Found agent: ${JSON.stringify(agent)}`)
      Promise.all([
        checkUserByField('email', agent.email),
        checkUserByField('domain_agent_id', agent.agentId),
        fetchAgency(agent.agencyId),
      ]).then(values => {
        each({
          email: values[0],
          domain_agent_id: values[1],
        }, (result, key) => {
          if (result === null) {
            debug(`Agent with specified ${key} does not exist.`)
            return
          }
          const allowedValue = get(allowed, key)
          if (allowedValue && allowedValue === result[key]) {
            debug(`Agent ID ${agent_id} matches to allowed ${key}: ${allowedValue}`)
            return
          }
          return reject(new Error(`Agent with ${key} == ${result[key]} has already been assigned to user ${result.id}`))
        })
        debug(`Resolving user data.`)
        agent.agency = values[2]
        return resolve(getUserFieldsFromAgent(agent))
      })
    })
  })
}

module.exports = {
  getUserFieldsFromAgent,
  fetchAgentAndCheck,
}