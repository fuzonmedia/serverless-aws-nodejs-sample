const debug = require('debug')('route::proposals')
const { getProposalsForSeller } = require('./proposalDatabaseUtils')
const { fetchUsersByField } = require('./userDatabaseUtils')
const { fetchReviewsForUsers } = require('./reviewsDatabaseUtils')
const { fetchAgentListingStats } = require('./api')
const { auth, cors, preventTimeout } = require('./middleware')
const { use } = require('./util/http')
const { intersection, map, keyBy, groupBy, reduce, sortBy, get, has, pick, sumBy } = require('lodash')
const geolib = require('geolib')

module.exports.get = use(
  cors(),
  auth({ usertype: 'seller' }),
  preventTimeout(),
  (req, res) => {
    const prepareFilter = (input) => {
      let filters
      const predicatees = []

      debug(`Input: ${JSON.stringify(input)}`)
      filters = pick(input, ['type', 'priceMin', 'priceMax', 'latitude', 'longitude', 'distance'])

      if (filters.type) {
        predicatees.push(proposal => {
          return get(proposal, 'storyData.property.type') === filters.type
        })
      }

      if (filters.latitude || filters.longitude || filters.distance) {
        // This looks stupid, but we must throw an error if at least one param is missing
        if (!filters.latitude || !filters.longitude || !filters.distance) {
          return res.status(415).json({
            error: 'Invalid location filter.',
          })
        }
        predicatees.push(proposal => {
          if (!has(proposal, 'storyData.property.geoLocation')) {
            return false
          }
          const distance = geolib.getDistanceSimple(
            pick(filters, ['latitude', 'longitude']),
            pick(proposal.storyData.property.geoLocation, ['latitude', 'longitude']),
            50 // precision
          )
          return distance <= filters.distance
        })
      }

      if (filters.priceMin) {
        const priceMin = parseInt(filters.priceMin, 10)
        predicatees.push(proposal => {
          let min = get(proposal, 'storyData.priceMin', null)
          return min && (parseInt(min, 10) >= priceMin)
        })
      }

      if (filters.priceMax) {
        const priceMax = parseInt(filters.priceMin, 10)
        predicatees.push(proposal => {
          let max = get(proposal, 'storyData.priceMax', null)
          return max && (parseInt(max, 10) <= priceMin)
        })
      }

      return predicatees.length > 0 ? predicatees : null
    }

    /** @type Array */
    let includes = get(req.query, 'include', ['stats'])
    if (includes) {
      if (!Array.isArray(includes)) {
        includes = includes.toString().split(',')
      }
    }

    const sort = get(req.query, 'sort', 'reviews')
    const filters = prepareFilter(req.query)

    let step = 0

    if (includes.indexOf('stats') === -1) {
      // We need this for sorting here.
      includes.push('stats')
    }

    includes = intersection(includes, ['fake', 'sales', 'listings', 'stats'])

    debug(`STEP ${++step}: fetching proposals from DB`)
    getProposalsForSeller(req.auth.user).then(
      proposals => {
        const userIds = map(proposals, p => p.agentData.id)
        // In this case we don't need to query anything
        if (includes.length === 0 || proposals.length === 0 || userIds.length === 0) {
          return proposals
        }

        debug(`STEP ${++step}: fetching user data for proposals`)
        return fetchUsersByField('id', userIds).then(
          users => keyBy(users, 'id')
        ).then(
          users => {
            // If we need fake data, map stats
            if (includes.indexOf('fake') !== -1) {
              return map(proposals, p => Object.assign(p, {
                domain_agent_id: get(users, [p.agentData.id, 'domain_agent_id']),
                stats: {
                  sales: 20,
                  current: 40,
                  withPrice: 5,
                  sumPrice: 4000,
                },
                listings: [],
                sales: [],
              }))
            }

            // Extract agent IDs from users. Ignore empty values.
            const domainAgentIds = reduce(users, (ids, user) => {
              if (user.domain_agent_id) ids.push(user.domain_agent_id)
              return ids
            }, [])

            includes.push('agent_id')
            // Fetch stats and append to each proposal
            debug(`STEP ${step}.a: fetching agent stats for users`)
            return fetchAgentListingStats(domainAgentIds).then(
              stats => map(proposals, p => {
                const agentId = get(users, [p.agentData.id, 'domain_agent_id'])
                const proposalStats = get(stats, agentId, {})
                return Object.assign(p, pick(proposalStats, includes))
              })
            )
          }
        )
      }
    ).then(
      proposals => {
        if (filters === null) {
          return proposals
        }

        debug(`STEP ${++step}: Filtering proposals by ${filters.length} parameter(s).`)

        return proposals.filter(p => {
          for (let filter of filters) {
            if (!filter(p)) {
              return false
            }
          }
          return true
        })
      }
    ).then(
      proposals => {
        if (proposals.length === 0) {
          debug('No proposals after filtering.')
          return proposals
        }
        debug(`STEP ${++step}: Sorting proposals by [${sort}]`)
        switch (sort) {
          case 'reviews':
            const userIds = map(proposals, p => p.agentData.id)
            if (userIds.length === 0) {
              debug('No data for reviews sorting')
              return proposals
            }
            return fetchReviewsForUsers(userIds, {
              ProjectionExpression: 'averageRating,reviewedUserId',
              // Select: 'ALL_PROJECTED_ATTRIBUTES',
            }).then(
              reviews => groupBy(reviews, 'reviewedUserId')
            ).then(
              reviews => reduce(reviews, (userRatings, rs, id) => {
                let count = rs.length
                userRatings[id] = sumBy(rs, 'averageRating') / count
                return userRatings
              }, {})
            ).then(
              userRatings => {
                return map(proposals, p => {
                  p.agentRating = get(userRatings, p.agentData.id)
                  return p
                })
              }
            ).then(
              // We need descending ordering here, so we use minus
              proposals => sortBy(proposals, [p => -1 * p.agentRating])
            )
            break
          case 'listings':
          case 'current':
            // We need descending ordering here, so we use minus
            return sortBy(proposals, [p => -1 * p.stats.current])
            break
          case 'volume':
          case 'sumPrice':
            // We need descending ordering here, so we use minus
            return sortBy(proposals, [p => -1 * p.stats.sumPrice])
            break
          case 'average':
          case 'avgPrice':
            // We need descending ordering here, so we use minus
            return sortBy(proposals, [p => -1 * p.stats.sumPrice / p.stats.withPrice])
            break
          case 'newest':
            return sortBy(proposals, [p => -1 * p.createdAt])
            break
          case 'oldest':
            return sortBy(proposals, [p => p.createdAt])
            break
          default:
            return proposals
        }
      }
    ).then(
      proposals => {
        debug(`STEP ${++step}: Pagination`)
        const page = get(req.query, 'page', null)

        if (page === null) {
          return proposals
        }

        const pageSize = parseInt(get(req.query, 'pageSize', 25), 10)
        const offset = (parseInt(page, 10) - 1) * pageSize

        return proposals.slice(offset, offset + pageSize)
      }
    ).then(
      result => res.json({
        message: 'Done',
        result,
      })
    )
  }
)
