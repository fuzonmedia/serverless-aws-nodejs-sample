const { get } = require('lodash')
const debug = require('debug')('http_cache_adapter')
const url = require('url')
const md5 = require('md5')
const buildURL = require('axios/lib/helpers/buildURL')
const httpAdapter = require('axios/lib/adapters/http')

const ttl = process.env.REDIS_TTL ? parseInt(process.env.REDIS_TTL, 10) : 86400

function getCacheKey(config) {
    debug('Getting cache key for URL: ' + config.url)
    const parsed = url.parse(config.url)
    const path = buildURL(parsed.path, config.params, config.paramsSerializer).replace(/^\?/, '')
    return 'api::' + md5(path)
}

module.exports = function (
    redis,
    request = httpAdapter
) {
    const makeHttpRequest = config => request(config).then(res => {
        debug('Received HTTP response')
        const { config, status, statusText, headers, data } = res
        const cacheKey = getCacheKey(config)
        const cacheValue = JSON.stringify({ status, statusText, headers, data })

        if (redis) {
            debug(`Storing response to redis with key ${cacheKey}`)
            redis.set(cacheKey, cacheValue, 'EX', ttl, (e) => { 
                console.log(e)
            })
        } else {
            debug('Redis is null')
        }

        return res
    })

    return (config) => new Promise(resolve => {

        // Only process reading requests
        debug(`Received HTTP method ${config.method}`)
        if (config.method !== 'get' && config.method !== 'head' || get(config, 'direct', false) || redis === null) {
            debug('Non-reading request')
            return request(config).then(response => resolve(response))
        }

        const cacheKey = getCacheKey(config)

        if (redis) {
            debug(`Reading redis key ${cacheKey}`)
            redis.get(cacheKey, (err, v) => {
            if (err || !v) {
                debug('Could not retrieve Redis entry with key ' + cacheKey)
                console.log(err, v)
                return makeHttpRequest(config).then(r => resolve(r))
            }
            const response = JSON.parse(v)
            response.config = config
            return resolve(response)
            })
        } else {
            debug('Redis is null')
        }
    })
}
