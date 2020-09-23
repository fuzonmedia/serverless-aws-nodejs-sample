const debug = require('debug')('route::agents')

const { use } = require('./util/http')
const { pick, filter } = require('lodash')
const { fetchUsersByField } = require('./userDatabaseUtils')

const { searchAgents } = require('./api')

module.exports.list = use(
  (req, res) => {
    fetchUsersByField('usertype', 'agent').catch(
      error => res.json({
        message: 'Error',
        result: error,
      })
    ).then(
      users => filter(users, user => user.agentstatus === 'active')
    ).then(
      users => users.map(user => pick(user, [
        'id',
        'email',
        'agentlicense',
        'company',
        'firstname',
        'lastname',
        'profilephoto',
        'suburbs',
        'postcodes',
      ]))
    ).then(
      users => res.json({
        message: 'Done',
        users,
      })
    )
  }
)

module.exports.search = use(
  (req, res) => {
    req.context.callbackWaitsForEmptyEventLoop = false

    const { agent_name } = req.query

    if (!agent_name) {
      res.status(415).json({
        message: '[agent_name] query parameter must be specified',
      })
      return
    }

    debug(`Search agents by [${agent_name}]`)

    searchAgents(agent_name, null, { direct: false }).catch(e => {
      debug(`Search error: ${JSON.stringify(e)}`)
      res.status(500).json({
        message: 'Error',
      })
    }).then(agents => {
      debug(`Received data: ${agents.length}`)
      res.json({
        message: 'Done',
        agents,
      })
    })
  }
)
