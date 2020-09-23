const { get } = require('./current-listings')

process.env.API_DOMAIN_CLIENT_ID = 'pwhars463wv75757b2wc4z8v'
process.env.API_DOMAIN_CLIENT_SECRET = 'mb5AwjGDCt'
jest.setTimeout(60000)
test('it works', done => {
    get({
        pathParameters: {
            agent_id: 916802,
        },
        query: {
            direct: true,
        },
    }, {}, (err, response) => {
        console.log('done')
        console.log(response)
        done()
    })
})
