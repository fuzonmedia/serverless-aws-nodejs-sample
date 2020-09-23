const axios = require('axios')
const auth = require('./auth')

test('it requests token if not stored in cache', done => {

    let receivedToken

    const resolve = auth(axios, {
        getAsync: key => {
            expect(key).toBe('api::access_token')
            return new Promise(resolve => resolve(null))
        },
        setAsync: (key, value, ...ops) => {
            receivedToken = JSON.parse(value).access_token
            expect(key).toBe('api::access_token')
            expect(ops[0]).toBe('EX')
            return new Promise(resolve => resolve(null))
        }
    }, {
        clientId: process.env.API_DOMAIN_CLIENT_ID,
        clientSecret: process.env.API_DOMAIN_CLIENT_SECRET
    })

    resolve().then(token => {
        expect(token).toBe(receivedToken)
        done()
    })
})

test('it does not make request if token stored', done => {

    let requestsCount = 0
    const interceptorId = axios.interceptors.request.use(config => {
        requestsCount++
        return config
    })

    const resolve = auth(axios, {
        getAsync: key => {
            expect(key).toBe('api::access_token')
            return new Promise(resolve => resolve(JSON.stringify({
                access_token: 'test_token',
                expires_at: Date.now() + 3600 * 24,
            })))
        },
        setAsync: () => {
            return new Promise(resolve => resolve(null))
        }
    }, {
        clientId: 'invalid',
        clientSecret: 'invalid',
    })

    resolve().then(token => {
        expect(token).toBe('test_token')
        expect(requestsCount).toBe(0)
        axios.interceptors.request.eject(interceptorId)
        done()
    })
})
