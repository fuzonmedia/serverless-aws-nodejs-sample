const debug = require('debug')('routes::story-admin')
const {
  sendNotificationMail,
  fetchstory,
} = require('./storyDatabaseUtils')
const { fetchUsersByField } = require('./userDatabaseUtils')
const { get } = require('lodash')
const { use } = require('./util/http')
const { auth, cors } = require('./middleware')

module.exports.sendstorysToAgents = use(cors(), auth(), (req, res) => {
  const { body } = req

  const token = get(body, 'token')
  const sandbox = get(body, 'sandbox', false)
  const key = get(body, 'key', 'email')
  const id = get(body, 'story')
  let values = get(body, 'users', [])

  if (!id) {
    debug('story ID is not provided')
    return res.status(404).json({
      message: 'Not Found',
    })
  }

  if (!Array.isArray(values)) {
    debug('values field is not an array')
    return res.status(415).json({
      message: 'users field is not an array',
    })
  }

  if (values.length < 1) {
    return res.status(415).json({
      message: 'At least one user required',
    })
  }

  let fetchUsers
  switch (key) {
    case 'domain_agent_id':
      values = values.map(parseInt)
    case 'email':
    case 'id':
      fetchUsers = () => fetchUsersByField(key, values)
      break
    default:
      return res.status(415).json({
        message: 'Error',
        error: `Invalid key type ${JSON.stringify(key)}`,
      })
      break
  }

  let sent = 0

    return Promise.all([
        fetchstory(id).catch(e => {
          debug(`story fetching error: ${JSON.stringify(e)}`)
          return null
        }),
        fetchUsers().catch(e => {
          debug(`Users fetching error: ${JSON.stringify(e)}`)
          return []
        }),
    ]).then(([story, users]) => {
      if (!story) {
        debug('story ID not found')
        return res.status(404).json({
          message: 'Not Found',
        })
      }
      debug(`Found ${users.length} user(s)`)
      sent = users.length
      return (users.length) ? sendNotificationMail(story, users, sandbox) : null
    }).then(() => res.json({
      message: 'Done',
      sent,
    }))
})
