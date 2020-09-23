const makeAdapter = require('./adapter')
const md5 = require('md5')
const axios = require('axios')

test('it stores response to redis', done => {
    let redisResponded = false

    const stubResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: 'OK',
    }

    const adapter = makeAdapter({
        getAsync: key => {
            expect(key).toBe(`api::${md5('some_url')}`)
            return new Promise(resolve => resolve(null))
        },
        setAsync: (key, value, ...ops) => {
            expect(key).toBe(`api::${md5('some_url')}`)
            expect(value).toBe(JSON.stringify(stubResponse))
            expect(ops[0]).toBe('EX')
            return new Promise(resolve => {
                redisResponded = true
                resolve(null)
            })
        }
    }, (config) => {
        return new Promise(resolve => {
            resolve(Object.assign({}, stubResponse, {
                config,
            }))
        })
    })

    const http = axios.create({adapter})

    http.get('some_url').then(res => {
        while (!redisResponded) {}
        expect(res.data).toBe('OK')
        done()
    })
})

test('it returns stored response', done => {
    const stubResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: 'OK',
    }

    const adapter = makeAdapter({
        getAsync: key => {
            expect(key).toBe(`api::${md5('some_url')}`)
            return new Promise(resolve => resolve(JSON.stringify(stubResponse)))
        },
        setAsync: () => {},
    }, (config) => {
        return new Promise(resolve => {
            throw new Error('Request must not be executed')
        })
    })

    const http = axios.create({adapter})

    http.get('some_url').then(res => {
        expect(res.data).toBe('OK')
        done()
    })
})
