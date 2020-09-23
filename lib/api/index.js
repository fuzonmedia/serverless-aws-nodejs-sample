const debug = require('debug')('api')
const { each, filter, concat, reduce, get, isInteger, keyBy, pick } = require('lodash')
const moment = require('moment')

function fetchMultiPageListings ({
    agent_id,
    client,
    filterPredicatee = null,
    includedArchivedListings = null,
    dateUpdatedSince = null,
    pageSize = 100,
    direct = false,
    limit = null,
}) {
  let results = []

  const url = `agents/${agent_id}/listings`
  debug(`Fetching listings from [${url}] with limit [${limit}]`)

  function fetch (pageNumber = 1) {
    const params = { pageNumber, pageSize }

    if (dateUpdatedSince !== null) {
      params.dateUpdatedSince = dateUpdatedSince
    }

    if (includedArchivedListings !== null) {
      params.includedArchivedListings = includedArchivedListings ? 'true' : 'false'
    }

    debug(`Requesting listings page ${pageNumber} with params ${JSON.stringify(params)}`)
    return client.get(url, { direct, params }).then(({ data }) => {
      debug(`Received response with ${data.length} objects`)
      if (data.length > 0) {
        const append = filterPredicatee ? filter(data, filterPredicatee) : data
        // Filter results before merging to reduce memory usage
        results = concat(results, append)
        debug(`Appended ${append.length} objects after filtering. Total: ${results.length}`)
      }

      if (limit !== null && results.length >= limit) {
        debug(`Reached limit of ${limit} records.`)
        results = results.slice(0, limit)
      } else if (data.length === pageSize) {
        return fetch(pageNumber + 1)
      }

      debug(`Request complete. Returning results ${results.length}`)
      return results
    })
  }
  return fetch()
}

/**
 *
 * @param agent_id
 * @param filterPredicatee
 * @param dateUpdatedSince
 * @param includedArchivedListings
 * @param direct
 * @param limit
 * @returns Promise<Array>
 */
module.exports.fetchAgentListings = (
  agent_id,
  // Filter function
  filterPredicatee = null,
  // Options
  {
    dateUpdatedSince = null,
    includedArchivedListings = true,
    direct = false,
    limit = null,
  } = {}
) => {
  const client = require('./axios')

  if (dateUpdatedSince === null) {
    dateUpdatedSince = moment().startOf('day').subtract(1, 'y').toISOString()
  }

  return fetchMultiPageListings({
    agent_id,
    client,
    filterPredicatee,
    dateUpdatedSince,
    includedArchivedListings,
    direct,
    limit,
  })
}

const statsListingsFields = [
    'propertyTypes',
    'status',
    'channel',
    'addressParts',
    'bedrooms',
    'bathrooms', 
    'carspaces',
    'geoLocation', 
    'media',
    'governmentRecordedSoldPrice',
    'soldDate',
    'priceDetails',
    'saleDetails'
]

module.exports.fetchAgentListingStats = (agent_ids, dateUpdatedSince = null) => {
    const client = require('./axios')

    const promises = []

    if (dateUpdatedSince === null) {
        dateUpdatedSince = moment().startOf('day').subtract(1, 'y').toISOString()
    }

    debug('Getting stats for agent ids: ' + agent_ids)

    each(agent_ids, (agent_id) => {
        if (typeof agent_id === 'undefined' || !agent_id) {
            return
        }
        promises.push(
          fetchMultiPageListings({
            agent_id,
            client,
            dateUpdatedSince,
            direct: false,
            includedArchivedListings: true, 
          }).catch(e => {
            console.log(`API error for agent [${agent_id}]`)
            console.log(e)
            return null
          }).then(listings => {
            debug(`Received listings for agents: ${listings.length}`)
            return reduce(listings, (res, l) => {
                if (l.status === 'sold') {
                  res.stats.sales++
                  res.sales.push(pick(l, statsListingsFields))
                  const priceValue = get(l, ['saleDetails','soldDetails','soldPrice'], false)
                  if (!isNaN(priceValue)) {
                    res.stats.withPrice++
                    res.stats.sumPrice = res.stats.sumPrice + priceValue
                  }
                } else if (l.status === 'live' || l.status === 'under offer') {
                    res.stats.current++
                    res.listings.push(pick(l, statsListingsFields))
                }
                return res
            }, {
                agent_id,
                stats: {
                    sales: 0,
                    current: 0,
                    withPrice: 0,
                    sumPrice: 0,
                },
                listings: [],
                sales: [],
            })
          })
        )
    })

    if (promises.length === 0) {
      debug('Empty agents list')
      return new Promise(resolve => resolve([]))
    }

    debug(`Fetching listing stats for agents: ${agent_ids.join(',')}`)
    return Promise.all(promises).then((results = []) => {
        return keyBy(filter(results), 'agent_id')
    })
}

/**
 * Search for agents by name
 *
 * @param {*} agent_name
 */
module.exports.searchAgents = (
    agent_name,
    filterPredicatee = null,
    {
        direct = false
    } = {}
) => {
    const client = require('./axios')

    const url = 'agents/search'
    debug(`Searching agents by [${agent_name}]`)
    const pageSize = 20 // Max page size for this endpoint

    let results = []

    const fetch = (pageNumber = 1) => {
        const params = {
            pageNumber,
            pageSize,
            query: agent_name
        }
        debug(`Requesting page ${pageNumber} with params ${JSON.stringify(params)}`)
        return client.get(url, { direct, params }).then(({ data }) => {
            debug(`Received response with ${data.length} objects`)
            if (data.length > 0) {
                const append = data
                // Filter results before merging to reduce memory usage
                results = concat(results, append)
            }

            debug(`Request complete. Returning results ${results.length}`)
            return results
        })
    }

    return fetch()
}

module.exports.fetchAgent = (agent_id) => {
  const client = require('./axios')

  return client.get(`/agents/${agent_id}`).then(({ data }) => data).catch(e => {
    console.log(e)
    return null
  })
}

module.exports.fetchAgency = (agency_id) => {
  const client = require('./axios')
  return client.get(`/agencies/${agency_id}`).then(({ data }) => data).catch(e => {
    console.log(e)
    return null
  })
}