const debug = require('debug')('slugs')
const { each, pick, isEqual, get, map, uniq } = require('lodash')
const AWS = require('aws-sdk')
AWS.config.update({region:'ap-southeast-2'})
const bluebird = require('bluebird')
const dynamoDb = bluebird.promisifyAll(new AWS.DynamoDB.DocumentClient())
const slugify = require('slugify')

const TableName = 'agentsUsersSlugs'

const slugDeactivate = (email) => {
  const getQuery = {
    TableName,
    IndexName: 'email-slug-index',
    KeyConditions: {
      email: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [email],
      },
    },
    QueryFilter: {
      active: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [true],
      },
    },
  }
  debug('Executing query: ' + JSON.stringify(getQuery))
  return dynamoDb.queryAsync(getQuery).then(({ Items, Count }) => {
    if (Count < 1) {
      return {}
    }
    return Promise.all(each(Items, ({base, slug}) => {
      const updateQuery = {
        TableName,
        Key: {
          base,
          slug,
        },
        ExpressionAttributeNames: {
          '#active': 'active',
        },
        UpdateExpression: 'set #active = :active',
        ExpressionAttributeValues: {
          ':active': false,
        },
        ReturnValues: 'NONE',
      }
      debug('Executing update query: ' + JSON.stringify(updateQuery))
      return dynamoDb.updateAsync(updateQuery)
    })).catch(e => {
      debug(`Update query error: ${e.message}`)
      throw e
    }).then(() => {
      debug(`All update queries completed`)
      return {}
    })
  })
}

const slugCount = (base) => {
  const countQuery = {
    TableName,
    KeyConditions: {
      base: { ComparisonOperator: 'EQ', AttributeValueList: [base] },
    },
    Select: 'COUNT',
  }
  debug('Executing count query: ' + JSON.stringify(countQuery))
  return dynamoDb.queryAsync(countQuery).then(({ Count }) => {
    debug('Count query result: ' + Count)
    return Count
  }).catch(e => {
    debug(`Count query error: ${e.message}`)
    throw e
  })
}

const slugCreate = (Item) => {
  const putQuery = {
    TableName,
    Item,
  }
  debug('Executing put query: ' + JSON.stringify(putQuery))
  // Put query only after deactivation
  return dynamoDb.putAsync(putQuery).then(() => Item).catch(e => {
    debug(`Put query error: ${e.message}`)
    throw e
  })
}

const getExecutor = ({ dynamodb: { NewImage, OldImage, Keys }}) => {
  console.log({ NewImage, OldImage, Keys })
  const email = Keys.email.S
  const newData = pick(NewImage, ['firstname', 'lastname'])
  const oldData = OldImage ? pick(OldImage, ['firstname', 'lastname']) : {}

  if (isEqual(newData, oldData)) {
    debug('Name was not changed.')
    return { email, noChange: true }
  }

  const name = `${get(newData, 'firstname.S', '')} ${get(newData, 'lastname.S', '')}`.trim()

  if (name.length < 1) {
    debug('Cannot create slug from empty name')
    return { email, noChange: true }
  }

  const base = slugify(name, {
    lower: true,
  })

  debug(`Base slug: [${base}], Name: [${name}]`)

  // Count and deactivate queries can be done in parallel
  return Promise.all([
    slugCount(base),
    slugDeactivate(email),
  ]).then(([Count]) => {
    const slug = `${base}-${Count + 1}`
    // Put query only after deactivation
    return slugCreate({ base, slug, email, active: true }).then(({ email, slug }) => { email, slug })
  }).catch(error => {
    debug(`Error: ${error.message}`)
    return { email, error }
  })
}

module.exports.create = ({ Records }, context, callback) => {
  Promise.all(map(Records, getExecutor)).then(values => {
    debug(values)
    callback(null, 'Ok')
  }).catch(e => {
    console.log('Undefined error')
    debug(e)
    callback(null, 'Error')
  })
}
