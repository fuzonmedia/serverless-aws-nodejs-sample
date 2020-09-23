const debug = require('debug')('util::http')
const { reduce, set, flattenDeep } = require('lodash')
const { ServerResponse } = require('http')
const ExpressRequest = require('express/lib/request')
const ExpressResponse = require('express/lib/response')
const { compileETag } = require('express/lib/utils')
const pipeworks = require('pipeworks')

// Emulate express application settings behavior
const app = {
  get: (key) => {
    switch (key) {
      case 'etag fn': return compileETag('weak')
      default: return undefined
    }
  }
}

const Request = (event = {}) => {
  return Object.assign(Object.create(ExpressRequest, {
    // Enumerable must be false to avoid circular reference issues
    app: { configurable: true, enumerable: false, writable: true, value: app },
    res: { configurable: true, enumerable: false, writable: true, value: {} },
  }), {
    // HTTP Method
    method: event.httpMethod,
    // Headers converted to lowercase
    headers: reduce(event.headers, (h, v, k) => set(h, k.toLowerCase(), v), {}),
    // Path
    url: event.path || '/',
    // Route parameters
    params: event.pathParameters || {},
    // Request context
    requestContext: event.requestContext || {},
    // API Gateway resource definition
    resource: event.resource || '/',
    // Transformed query parameters
    query: event.queryStringParameters || {},
    // Stage variables
    stage: event.stageVariables || {},
    // Body
    body: event.body,
  })
}

const Response = (request) => {
  const response = Object.assign(
    Object.create(ExpressResponse, {
      // Enumerable must be false to avoid circular reference issues
      app: { configurable: true, enumerable: false, writable: true, value: app },
      req: { configurable: true, enumerable: false, writable: true, value: request },
    }),
    new ServerResponse(request)
  )

  response.send = (body) => {
    const ret = ExpressResponse.send.call(response, body)
    for (let callback of response.outputCallbacks) {
      if (typeof callback === 'function') {
        callback()
      }
    }
    return ret
  }

  return response
}

const use = (...middleware) => {
  return (
    event = {},
    context = {},
    callback = debug
  ) => {
    const req = Request(event)
    const res = Response(req)
    req.context = context
    req.res = res

    // This is required to avoid multiple callback executions.
    let finished = false

    res.on('finish', () => {
      if (finished) return

      debug('Response finished')
      finished = true

      // If headers sent, buffer contains headers line in first index
      if (res.headersSent) delete res.output[0]

      callback(null, {
        // Response Status Code
        statusCode: res.statusCode,
        // Response Headers
        headers: reduce(
          // Take response header names
          res._headerNames,
          // Assign header values to new object using header names
          (headers, name, key) => set(headers, name, res._headers[key]),
          {}
        ),
        // Body String
        body: reduce(res.output, (body, buffer) => {
          // Buffer may be undefined
          if (buffer) {
            body += buffer.toString()
          }
          return body
        }, '')
      })
    })

    const pipe = reduce(
      // Allow nested arrays
      flattenDeep(middleware),
      // Transform Express middleware into Pipework handler
      (pipe, executor, i) => {
        debug(`Pushing middleware ${i} into pipe`)
        return pipe.fit(({req, res}, next) => {
          executor(req, res, (err) => {
            if (err) throw err
            else return next({req, res})
          })
        })
      },
      // Pipe initializer
      pipeworks()
    )

    // This must not happen in general. There must be error handler
    pipe.fault((context, error) => {
      debug(`Uncaught error: ${JSON.stringify(error)}`)
      debug(`Context: ${JSON.stringify(context)}`)
      callback(error)
    })

    debug('Running middleware stack')
    pipe.flow({req, res})
    // This debug might appear before response finish if code is async
    debug('Middleware stack completed')
  }
}

module.exports = {
  use,
  Request,
  Response,
}
