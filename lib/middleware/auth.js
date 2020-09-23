const debug = require('debug')('middleware::auth')
const { get } = require('lodash')
const { checkUserByField } = require('../userDatabaseUtils')
const jwt = require('jsonwebtoken')

const getTokenFromRequest = (req) => {
  // Authorization header is the first priority
  let headerToken = req.header('Authorization')
  if (headerToken && headerToken.substring(0, 7) === 'Bearer:') {
    let token = headerToken.substring(7).trim()
    if (token.length === 0) {
      throw new Error('Invalid Authorization header')
    }
    debug(`Token provided in Authorization header: [${token}]`)
    return token
  }

  if (
    // Parse body for non-reading requests
    req.method !== 'GET' && req.method !== 'HEAD' &&
    // AND if body had been parsed and contains 'token' field
    typeof req.body === 'object' &&
    req.body.token
  ) {
    if (typeof req.body.token !== 'string' || req.body.token.length === 0) {
      throw new Error('Invalid token parameter in request body')
    }
    debug(`Token provided in request body: [${req.body.token}]`)
    return req.body.token
  }

  if (req.query.token) {
    if (typeof req.query.token !== 'string' || req.query.token.length === 0) {
      throw new Error('Invalid token parameter in request query')
    }
    debug(`Token provided in query string: [${req.query.token}]`)
    return req.query.token
  }

  debug('No valid authorization method provided')

  return null
}

module.exports = (params) => {
  let usertype = get(params, 'usertype', ['admin'])
  const strict = !!get(params, 'strict', true)

  if (usertype && !Array.isArray(usertype)) {
    usertype = [usertype]
  }

  return (req, res, next) => {
    const emptyTokenAction = () => {
      if (!strict) {
        debug('NON-STRICT authentication. Token not provided or invalid.')
        req.auth = null
        return next()
      }

      debug('STRICT authentication. Token not provided or invalid.')
      return res.status(401).json({
        error: 'Unauthorized.',
      })
    }

    let token

    try {
      token = getTokenFromRequest(req)
    } catch (e) {
      return res.status(400).json({
        error: e.message,
      })
    }

    if (!token) return emptyTokenAction()

    jwt.verify(token, process.env.PASSWORD_SECRET_SALT, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          error: 'Unauthorized.',
        })
      }

      if (typeof decoded.aud === 'string') {
        decoded.aud = decoded.aud.split(':')
      } else if (!Array.isArray(decoded.aud)) {
        return res.status(400).json({
          error: 'Invalid token claims.',
        })
      }

      const [host, aud] = decoded.aud
      if (host !== process.env.APP_HOST) {
        debug(`Invalid host: ${host} !== ${process.env.APP_HOST}`)
        return res.status(401).json({
          error: 'Access Denied. Invalid host.',
        })
      }

      if (usertype && usertype.indexOf(aud) === -1) {
        debug(`User type mismatch. Expected: ${usertype.join('/')}. Actual: ${aud}`)
        return res.status(403).json({
          error: 'Access Denied. Insufficient rights.',
        })
      }

      const user = {
        id: decoded.sub,
        usertype: aud,
        firstname: decoded.given_name,
        lastname: decoded.family_name,
        email: decoded.email,
      }

      req.auth = {
        token,
        user,
      }

      debug(`Authentication passed by user ${user.email} / ${user.id}`)

      return next()
    })
  }
}