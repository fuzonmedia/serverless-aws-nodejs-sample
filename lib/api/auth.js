const debug = require('debug')('auth')
const qs = require('querystring')

const grant_type = 'client_credentials'
const tokenKey = 'api::access_token'

const defaultAdapter = require('axios/lib/adapters/http')

module.exports = function (
    axios,
    redis,
    {
        clientId = null,
        clientSecret = null,
        scopes = [],
    } = {},
    adapter = defaultAdapter
) {
    const username = clientId || process.env.API_DOMAIN_CLIENT_ID
    const password = clientSecret || process.env.API_DOMAIN_CLIENT_SECRET
    const scope = scopes.length ? scopes.join(' ') : 'api_listings_read api_agencies_read'

    debug('Creating axios client')

    const http = axios.create({
        auth: { username, password },
        adapter,
    })

    debug(`Http client created with client ID: ${username}`)

    function requestToken() {

        debug('Executing HTTP request')

        return http.post('https://auth.domain.com.au/v1/connect/token', qs.stringify({
            grant_type,
            scope,
        })).then(res => {
            const { access_token, expires_in } = res.data
            debug(`HTTP response received with token: ${access_token}`)


            // Get timestamp of expiration to have absolute value for later use
            let expires_at = new Date()
            expires_at.setTime(Date.now() + expires_in * 1000)
            expires_at = expires_at.getTime()
            debug(`Token will expire at ${expires_at}`)

            // Store to redis, but don't wait for response.
            if (redis) {
                redis.set(
                    tokenKey,
                    JSON.stringify({
                        access_token,
                        expires_at,
                    }),
                    'EX',
                    expires_in - 5, // Expire the token earlier to avoid side-effects
                    (e) => {
                        console.log('REDIS SET ERROR!')
                        console.log(e)
                    }
                )
            }

            return access_token
        })
    }

    /**
     * Look for cached auth token in Redis
     */
    return function resolveToken({ direct = false } = {}) {
        debug(`Direct: ${direct}; Redis is null? ${JSON.stringify(redis === null)};`)
        return new Promise((resolve) => {
            if (direct || redis === null) {
                return requestToken().then(token => resolve(token))
            }

            debug(`Reading key from redis: ${tokenKey}`)
            redis.get(tokenKey, (err, value) => {
                if (err) {
                    console.log('REDIS ERROR')
                    console.log(err)
                    return resolve(requestToken())
                }

                debug(`Received value from redis: ${JSON.stringify(value)}`)

                // If value is empty dispatch HTTP request
                if (!value) {
                    return requestToken().then(token => resolve(token))
                }

                let parsed

                try {
                    parsed = JSON.parse(value)
                } catch (error) {
                    debug('Error parsing JSON')
                    // Unexpected case of malformed JSON
                    return requestToken().then(token => resolve(token))
                }

                debug(`Stored value parsed successfully`)

                // Compare expiration time in case redis did not expire the key
                const now = Date.now()

                if (!parsed.access_token || now > parsed.expires_at) {
                    debug(`Requesting new token. token expired or empty`)
                    return requestToken().then(token => resolve(token))
                }

                return resolve(parsed.access_token)
            })
        })
    }
}
