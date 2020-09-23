const debug = require('debug')('route::story')

const verifyTokenFunction = require('./verifytokenfunction');

const storyUtilsLib = require('./storyDatabaseUtils');

const liststoryRecord = storyUtilsLib.liststoryRecord;

var response = {
  message: "Not completed"
}

const { has } = require('lodash')
const { use } = require('./util/http')
const { cors, auth } = require('./middleware')

const fetchstory = (req, res) => {
  const { user } = req.auth
  const { id } = req.params

  storyUtilsLib.fetchstory(id).then(story => {
    if (user.usertype === 'seller' && user.id !== briew.ownerSellerId) {
      return res.json(403).json({
        message: 'Access Denied',
      })
    }

    return res.json({
      message: 'Done',
      storys: [story],
    })
  })
}

const liststorys = (req, res) => {
  const { user } = req.auth

  let query = {}
  let method = 'liststoryRecord'

  if (user.usertype === 'agent') {
    if (!user.postcodes || !user.suburbs) {
      return res.status(401).json({
        message: 'Suburbs must be selected to view storys',
      })
    }
    query.suburbfilter = user.suburbs
    query.postcodefilter = user.postcodes
    query.statusfilter = 'approved'
  } else if (user.usertype !== 'admin') {
    query = user.id
    method = 'getstoryByOwner'
  }

  storyUtilsLib[method](query, ({ result, message }) => {
    if (!Array.isArray(result)) {
      result = [result]
    }

    res.json({
      message: message || 'Done',
      storys: result,
    })
  })
}

module.exports.list = use(
  cors(), auth({ usertype: null }),
  (req, res) => {
    const { user } = req.auth

    if (user.usertype === 'agent' && user.agentstatus !== 'active') {
      return res.status(403).json({
        message: 'Account must be approved to view storys',
      })
    }

    if (req.query.identifier) {
      if (typeof req.query.identifier !== 'string') {
        return res.status(415).json({
          message: 'Invalid story identifier',
        })
      }
      req.params.id = req.query.identifier
      return fetchstory(req, res)
    } else {
      return liststorys(req, res)
    }
  }
)

module.exports.get = use(
  cors(), auth({ usertype: null }),
  fetchstory
)

const bodyParser = require('body-parser')

const { storestory } = require('./storyDatabaseUtils')

module.exports.store = use(
  cors(), bodyParser(), auth({ usertype: ['admin', 'seller'] }),
  (req, res) => {
    const { user } = req.auth
    let data = req.body

    if (typeof req.body === 'string') {
      data = JSON.parse(req.body)
    }

    if (user.usertype === 'admin' && !data.ownerSellerId) {
      return res.status(415).json({
        message: 'Seller ID is required',
      })
    } else if (user.usertype === 'seller') {
      data.ownerSellerId = user.id
    }

    storestory(data).then(story => {
      if (!story) {
        return res.status(415).json({
          message: 'Missing required story parameters: property.postcode, property.city',
        })
      }

      return res.status(201).json({
        message: 'Done',
        storyId: story.id,
      })
    })
  }
)

module.exports.update = use(
  cors(), bodyParser.json(), auth({ usertype: 'admin' }),
  (req, res) => {
    const data = req.body

    if (req.params.id) {
      data.id = req.params.id
    }

    const missing = ['id', 'ownerSellerId'].filter(v => has(data, v))

    if (missing.length) {
      return res.status(415).json({
        message: `Missing required fields: ${missing.join(', ')}`,
      })
    }

    storyUtilsLib.updatestoryRecord(data, function(res) {
      res.json(res)
    });
  }
)
