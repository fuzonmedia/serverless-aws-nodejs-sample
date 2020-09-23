const debug = require('debug')('dynamodb-helper')
const AWS = require('aws-sdk')
const dynamoDb = new AWS.DynamoDB.DocumentClient()

const promisify = (method) => {
    const f = function (params) {
        return new Promise((resolve, reject) => {
            debug(`Dispatching DynamoDB [${method}] request: ${JSON.stringify(params)}`)
            dynamoDb[method](params, (error, result) => {
                if (error !== null) {
                    console.log(`DynamoDB [${method}] error: ${JSON.stringify(error)}`)
                    reject(error)
                }
                resolve(result)
            })
        })
    }
    f.bind(dynamoDb)

    dynamoDb[`${method}Async`] = f
}

promisify('query')
promisify('scan')
promisify('put')

module.exports = dynamoDb

const { fromPairs, map } = require('lodash')

module.exports.makeQueryExpressionParams = (field, value, method = 'scan') => {
  let queryNamesField
  switch (method) {
    case 'scan':
    case 'scanAsync':
      method = 'scanAsync'
      queryNamesField = 'FilterExpression'
      break
    case 'query':
    case 'queryAsync':
      queryNamesField = 'KeyConditionExpression'
      method = 'queryAsync'
      break
    default:
      throw new Error(`Invalid DB method: ${method}`)
  }

  let ExpressionAttributeValues
  let QueryExpression

  if (Array.isArray(value)) {
    ExpressionAttributeValues = fromPairs(map(value, (v, i) => [`:check_value_${i}`, v]))
    QueryExpression = `#check_field IN (${Object.keys(ExpressionAttributeValues).join(',')})`
  } else {
    ExpressionAttributeValues = { ':check_value': value.toString() }
    QueryExpression = '#check_field = :check_value'
  }

  return {
    ExpressionAttributeNames: { '#check_field': field },
    [queryNamesField]: QueryExpression,
    ExpressionAttributeValues,
  }
}
