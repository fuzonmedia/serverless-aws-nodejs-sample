const debug = require('debug')('test-redis')
// redis = require('./api/redis')
var redis = require('redis')

module.exports.test = (event, context, callback) => {
    context.callbackWaitsForEmptyEventLoop = false 

    console.log('starting')
    
    // var bluebird = require('bluebird')
    
    
    // Allows to call redis method with Async suffix to get promises
    // bluebird.promisifyAll(redis.RedisClient.prototype)
    // bluebird.promisifyAll(redis.Multi.prototype)
    
    var config = {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 6379,
    }
    
    if (process.env.REDIS_USERNAME) {
        config.username = process.env.REDIS_USERNAME
    }
    
    if (process.env.REDIS_PASSWORD) {
        config.password = process.env.REDIS_PASSWORD
    }
    
    debug(config)

    console.log(config)
    console.log('creating client')
    let redisClient = redis.createClient(config)
    console.log('created client')
    
    redisClient.on('error', function(err) {
        console.log('Redis error: ' + err);
        redisClient = {}
    });
    
    // module.exports = redisClient

    debug('testing redis')
    val = Date.now().toString()
    console.log('Writing: ' + val)
    redisClient.set('test-key', val, redis.print)
    console.log('Getting key test-key')
    redisClient.get('test-key', (err, reply) => {

        if (err) {
            console.log('Error')
            callback(err)
            return
        }

        console.log("read: " + reply)
        debug('done')
        callback(null, 'Tested redis')
    })

    console.log('after get')
    
};
