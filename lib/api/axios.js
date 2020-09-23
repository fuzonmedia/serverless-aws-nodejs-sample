const { get } = require('lodash')

let redis
try {
    redis = require('./redis')
} catch (e) {
    redis = {}
}

const cachedAdapter = require('./adapter')(redis)

const axios = require('axios').create({
    baseURL: 'https://api.domain.com.au/v1/',
    adapter: cachedAdapter,
    timeout: 10000
})

const resolveToken = require('./auth')(require('axios'), redis)

let resolvedToken = null

axios.interceptors.request.use(function authInjector(config) {
  if (config.skipAuth === true) {
    return config
  }

  const direct = get(config, 'direct', false)

  function injectToken(token) {
    config.headers.Authorization = `Bearer ${token}`
    return config
  }

  return resolvedToken ? injectToken(resolvedToken) : resolveToken({ direct }).then(injectToken)
})

module.exports = axios
