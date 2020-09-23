const debug = require('debug')('route::test-http')
const { use } = require('./util/http')
const auth = require('./middleware/auth')

module.exports.testHttp = use([
  (req, res, next) => {
    req.middlewareOneExecuted = true
    next()
  },
  (req, res) => {
    res.send({
      m1: req.middlewareOneExecuted,
      m2: true,
    })
  }
])

module.exports.testHttpAuthentication = use(
  auth({ strict: false, usertype: false }),
  (req, res) => {
    res.json(req.auth)
  }
)
