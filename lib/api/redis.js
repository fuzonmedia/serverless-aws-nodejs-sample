var bluebird = require('bluebird')
var redis = require('redis')

// Allows to call redis method with Async suffix to get promises
bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

var config = {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
    no_ready_check: true,
    disable_resubscribing: true,
}

if (process.env.REDIS_USERNAME) {
    config.username = process.env.REDIS_USERNAME
}

if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD
}

config.retry_strategy = options => {
  console.log('Retry: ' + JSON.stringify(options))
  if (options.error && options.error.code === 'ECONNREFUSED') {
    // End reconnecting on a specific error and flush all commands with
    // a individual error
    return new Error('The server refused the connection');
  }

  if (options.total_retry_time > 1000 * 60 * 60) {
    // End reconnecting after a specific timeout and flush all commands
    // with a individual error
    return new Error('Retry time exhausted');
  }

  if (options.attempt > 1) {
    // End reconnecting with built in error
    return undefined;
  }

  // reconnect after
  return Math.min(options.attempt * 100, 3000);
}

let redisClient

if (typeof process.env.REDIS_HOST == 'undefined' || process.env.REDIS_DISABLED == 'true') {
  redisClient = null
} else {
  redisClient = redis.createClient(config)
  redisClient.on('error', function(err) {
    console.log('Redis error: ' + err);
  })
}

module.exports = redisClient
