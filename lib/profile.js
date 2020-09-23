const debug = require('debug')('route::profile')
const userUtilsLib = require('./userDatabaseUtils')
const { omit } = require('lodash')
const { use } = require('./util/http')
const { auth, cors } = require('./middleware')

module.exports.get = use(
  cors(),
  auth({ usertype: null, strict: false }),
  (req, res) => {
    // Allow usage of both /users?slug={id} and /users/{id}
    if (!req.params.user && req.query.slug) {
      req.params.user = req.query.slug
    }

    let promise
    if (req.params.user) {
      debug(`Slug defined: ${req.params.user}`)
      promise = userUtilsLib.fetchUserBySlug(req.params.user).then(({ user, redirect }) => {
        if (redirect) {
          res.json({
            redirect,
            identifier: user.id,
          })
        }

        return null
      })
    } else if (req.query.identifier) {
      promise = userUtilsLib.checkUserByField('id', req.query.identifier)
    } else {
      return res.status(415).send({
        message: 'Invalid request',
      })
    }

    promise.then(user => {
      // This might happen if redirect had been triggered
      if (res.headersSent) {
        return
      }

      if (!user || !user.id) {
        return res.status(404).json({
          message: 'Error retrieving user record from database',
        })
      }

      const defaultUserOutput = {
        identifier: user.id,
      }

      // Handle admin case first. No additional checks needed.
      if (req.user && req.user.usertype === 'admin') {
        debug('Admin access.')
        return res.json({
          userinfo: Object.assign(defaultUserOutput, omit(user, ['password'])),
        })
      }

      if (user.usertype === 'admin') {
        debug('Access Denied. Attempt to get admin user profile.')
        return res.status(404).json({
          message: 'Not found.'
        })
      }

      if (!user.emailVerified) {
        // TODO Check logic here. Possible security issue.
        return res.json({
          message: 'User email is not verified',
        })
      }

      // The only case which does not require authentication
      if (user.usertype === 'agent' && user.agentstatus === 'active') {
        debug('Active agent. Response allowed.')
        return res.json({
          userinfo: Object.assign(defaultUserOutput, omit(user, ['password', 'emailtoken', 'emailVerified', 'token'])),
        })
      }

      if (!req.user) {
        debug('Unauthenticated request')
        res.status(401).json({
          message: `Accessing ${user.usertype} profiles requires a token.`
        })
      }

      if (user.usertype === 'seller') {
        if (req.user.usertype === 'agent') {
          return res.json({
            userinfo: Object.assign(defaultUserOutput, omit(user, ['firstname', 'languages', 'agentexperience'])),
          })
        }

        if (req.user.usertype === 'seller' && user.id !== req.user.id) {
          return res.status(403).json({
            message: 'Access denied.',
          })
        }

        return res.json({
          userinfo: Object.assign(defaultUserOutput, omit(user, ['password'])),
        })
      } else if (user.usertype === 'agent') {
        if (user.agentstatus !== 'active') {
          return res.status(403).json({
            message: 'Only admins can access pending agent profiles.',
          })
        }

        return res.json({
          userinfo: Object.assign(defaultUserOutput, omit(user, ['password'])),
        })
      } else {
        console.log(`Invalid usertype detected for user ${JSON.stringify(user)}`)
        return res.status(404).json({
          message: 'Not found.'
        })
      }
    })
  }
)
