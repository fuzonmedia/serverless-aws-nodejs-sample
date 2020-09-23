const debug = require('debug')('body-parser')
const { get, toString } = require('lodash')
const { parse: decodeQuery } = require('qs') //require('querystring')
const { parse: decodeJson } = JSON

class BadRequestError extends Error {
  constructor(message) {
    super();
    this.message = message;
    this.stack = (new Error()).stack;
    this.name = this.constructor.name;
  }
}

const decode = (body, json = false) => {
  if (json) {
    debug('Parsing JSON body')
    return decodeJson(body)
  } else {
    debug('Parsing QS body')
    return decodeQuery(body)
  }
}

module.exports.BadRequestError = BadRequestError
module.exports.decode = decode
module.exports.parse = (request) => {
  if (['GET', 'HEAD', 'OPTIONS'].indexOf(request.httpMethod) !== -1) {
    return request
  }
  let body

  const contentType = toString(get(request.headers, 'Content-Type'))
  debug(`Content-Type: ${contentType}`)
  debug(`Is JSON: ${contentType === 'application/json'}`)
  debug(`Body: ${request.body}`)

  try {
    body = decode(request.body, contentType === 'application/json')
  } catch (e) {
    debug(`Error parsing body: ${e.message}`)
    throw new BadRequestError(e.message)
  }

  return Object.assign({}, request, {
    body,
    _body: request.body,
  })
}
