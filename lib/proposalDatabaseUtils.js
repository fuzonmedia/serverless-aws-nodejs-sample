const dynamoDb = require('./util/dynamodb')
const uuid = require('uuid')

const debug = require('debug')('route::proposals')
const { fetchAgentListingStats } = require('./api')
const { map, fromPairs, get, filter, keyBy, intersection, pick } = require('lodash')

const userUtilsLib = require('./userDatabaseUtils')

var helper = require('sendgrid').mail
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY)

function isStringVariableSet(variable) {
  if (variable !== undefined) {
    if (variable !== null) {
      if (variable.toString().trim() !== '') {
        return true; // If its not null or empty
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}


function sendProposalNotification(ownerSellerId, proposal) {
  userUtilsLib.getUserRecord({useridentifier: ownerSellerId}, function(usercb) {
    if (usercb.message == "Done") {
      if (usercb.result.email) {
        userUtilsLib.getUserRecord({useridentifier: proposal.agentData.id}, function (agentcb) {
          if (agentcb.message == "Done") {
            // Build the email
            var from_email = new helper.Email('support@agents.com.au', " Agents");
            var to_email = new helper.Email(usercb.result.email);
            var mail = new helper.Mail();
            mail.setFrom(from_email);
            mail.setSubject('You\'ve received a new proposal');
            personalization  = new helper.Personalization();
            personalization.addTo(to_email);
            personalization.addSubstitution(
              new helper.Substitution('-firstName-', usercb.result.firstname));
            personalization.addSubstitution(
              new helper.Substitution('-agentName-', proposal.agentData.firstname + " " + proposal.agentData.lastname));
            personalization.addSubstitution(
              new helper.Substitution('-agency-', agentcb.result.company.toString()));
            personalization.addSubstitution(
              new helper.Substitution('-agentfirstname-', proposal.agentData.firstname.toString()));
            personalization.addSubstitution(
              new helper.Substitution('-proposalid-', proposal.id.toString()));
              if (agentcb.result.biography) {
                var biography = agentcb.result.biography.replace(/(<([^>]+)>)/ig,"").substring(0, 120);
                personalization.addSubstitution(
                  new helper.Substitution('-bioExcerpt-', "&ldquo;" + biography + "...&rdquo;"));
              } else {
                personalization.addSubstitution(
                  new helper.Substitution('-bioExcerpt-', "Learn more about " + proposal.agentData.firstname + "on  Agents."));
              }
            personalization.addSubstitution(
              new helper.Substitution('-agentprofile-', agentcb.result.profilephoto.toString()));
            mail.addPersonalization(personalization);
            mail.setTemplateId('a586e74e-08fe-44fe-ac7c-0b5508cd46bb');
            console.log(mail.toJSON());
            // Send off the email
           var request = sg.emptyRequest({
             method: 'POST',
             path: '/v3/mail/send',
             body: mail.toJSON(),
           });
           sg.API(request, function(error, response) {
             if (error) {
               console.error(error);
             }
           });
          }
        });
      } else {
        console.error(usercb);
      }
   } else {
     console.error(usercb);
   }
 });
}

module.exports = {
  /**
   * @param user
   * @returns {Promise<{Items?: *}>}
   */
  getProposalsForSeller: (user) => {
    const query = {
      TableName: process.env.DYNAMODB_PROPOSALS_TABLE,
      ExpressionAttributeNames: {
        '#ownerSellerId': 'ownerSellerId',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':ownerSellerId': user.id,
        ':status': 'new'
      },
      FilterExpression: '#ownerSellerId = :ownerSellerId AND #status = :status',
    }

    return dynamoDb.scanAsync(query).then(
      ({ Items }) => {
        let shortlist = user.shortlist
        if (Array.isArray(shortlist)) {
          return map(Items, p => {
            const index = shortlist.indexOf(p.agentData.id)
            if (index !== -1) {
              p.isShortlisted = true
              // Reduce amount of further iterations
              delete shortlist[index]
            } else {
              p.isShortlisted = false
            }
            return p
          })
        }

        return map(Items, p => {
          p.isShortlisted = false
          return p
        })
      }
    )
  },

  listProposalRecord: function(info, callback) {
    // Dont worry about any parameters. Later we should look for a postcode though
    var proposalTableScan = {
       TableName: process.env.DYNAMODB_PROPOSALS_TABLE
    };
    if (info.proposalid !== undefined) {
      proposalTableScan.ExpressionAttributeNames = {
        '#id': 'id',
        '#status': 'status'
      };
      proposalTableScan.ExpressionAttributeValues = {
        ':id': info.proposalid,
        ':status': 'new'
      };
      proposalTableScan.FilterExpression = '#id = :id AND #status = :status';
    }
    if (info.ownerSellerId !== undefined) {
      proposalTableScan.ExpressionAttributeNames = {
        '#ownerSellerId': 'ownerSellerId',
        '#status': 'status'
      };
      proposalTableScan.ExpressionAttributeValues = {
        ':ownerSellerId': info.ownerSellerId,
        ':status': 'new'
      };
      proposalTableScan.FilterExpression = '#ownerSellerId = :ownerSellerId AND #status = :status';
    }
    if (info.interviewSent !== undefined) {
      proposalTableScan.ExpressionAttributeNames = {
        '#interviewSent': 'interviewSent',
        '#status': 'status'
      };
      proposalTableScan.ExpressionAttributeValues = {
        ':interviewSent': info.interviewSent,
        ':status': 'new'
      };
      proposalTableScan.FilterExpression = '#interviewSent = :interviewSent AND #status = :status';
    }
    if (info.agentid !== undefined) {
      proposalTableScan.ExpressionAttributeNames = {
        '#agentid': 'agentData'
      };
      proposalTableScan.ExpressionAttributeValues = {
        ':agentid': info.agentid
      };
      proposalTableScan.FilterExpression = '#agentid.id = :agentid';
    }

    dynamoDb.scanAsync(proposalTableScan).catch(error => {
      console.log(error)
      return callback({message: "Error", result: error})
    }).then(result => {
      debug(`Received Proposals response from DB: ${result.Count} item(s)`)

      if (result.Count === 0) {
        return callback({
          message: "Done",
          result: [],
        });
      }

      /** @type Array */
      let includes = get(info, 'query.include', [])
      if (includes) {
        if (!Array.isArray(includes)) {
          includes = includes.toString().split(',')
        }
      }

      includes = intersection(includes, ['fake', 'sales', 'listings', 'stats'])

      let proposals = result.Items

      let shortlist = info.shortlist
      if (Array.isArray(shortlist)) {
        proposals = map(proposals, p => {
          const index = shortlist.indexOf(p.agentData.id)
          if (index !== -1) {
            p.isShortlisted = true
            // Reduce amount of further iterations
            delete shortlist[index]
          } else {
            p.isShortlisted = false
          }
          return p
        })
      }

      // In this case we don't need to query anything
      if (includes.length === 0) {
        return callback({
          message: "Done",
          result: result.Items,
        });
      }

      const ExpressionAttributeValues = fromPairs(
        map(result.Items, (item, index) => [`:user${index}`, item.agentData.id])
      )

      const filterKeys = Object.keys(ExpressionAttributeValues).join(',')

      const usersQuery = {
        TableName: process.env.DYNAMODB_USERS_TABLE,
        FilterExpression : `id IN (${filterKeys})`,
        ExpressionAttributeValues,
      }

      return dynamoDb.scanAsync(usersQuery).then(usersResult => {
        // If no users found, we cannot fetch anything else.
        if (usersResult.Count === 0) {
          return callback({
            message: "Done",
            result: proposals,
          })
        }

        const userMap = keyBy(usersResult.Items, 'id')

        if (includes.indexOf('fake') !== -1) {
          return callback({
            message: "Done",
            result: map(proposals, p => Object.assign(p, {
              domain_agent_id: get(userMap, [p.agentData.id, 'domain_agent_id']),
              stats: {
                sales: 20,
                current: 40,
                withPrice: 5,
                sumPrice: 4000,
              },
              listings: [],
              sales: [],
            })),
          })
        }

        const domainAgentIds = filter(map(usersResult.Items, 'domain_agent_id'))

        return fetchAgentListingStats(domainAgentIds).catch(error => {
          return callback({message: "Error", result: error})
        }).then(stats => {
          debug(`Received stats from API: ${Object.keys(stats).length} item(s)`)
          return callback({
            message: "Done",
            result: map(proposals, p => {
              const s = get(stats, get(userMap, [p.agentData.id, 'domain_agent_id']), {})
              p.domain_agent_id = s.agent_id
              return Object.assign(p, pick(s, includes))
            })
          })
        })
      })
    })
  },

  createProposalRecord: function(info, callback) {
    if (info.propertyOwnerId && info.commission && info.storyidentifier) {
      // Set up queries (Search for property identifier)
      const doesproposalexist = {
         TableName: process.env.DYNAMODB_PROPOSALS_TABLE,
         ExpressionAttributeNames: {
           '#storyid': 'storyid'
         },
         FilterExpression: '#storyid = :storyid',
         ExpressionAttributeValues: {':storyid': info.storyidentifier}
      };
      dynamoDb.scan(doesproposalexist, function(pErr, pRes) {
        if (!pErr) {
          if (pRes.Count == 0) { // If theres no proposal record
            var storyRecord = pRes.Items[0];
            var commission = info.commission;
            var notes = info.proposalnote;
            var insertProposalRecord = {
              TableName: process.env.DYNAMODB_PROPOSALS_TABLE,
              Item: {
                id: uuid.v1(),
                status: 'new',
                ownerSellerId: info.propertyOwnerId,
                commission: info.commission,
                storyidentifier: info.storyidentifier,
                createdAt: new Date().getTime(),
                updatedAt: new Date().getTime()
              }
            };
            if (info.storydata ) {
              insertProposalRecord.Item["storyData"] = info.storydata;
            }
            if (info.agent !== undefined) insertProposalRecord.Item["agentData"] = info.agent;
            if (info.proposalnote) insertProposalRecord.Item.proposalnote = info.proposalnote;
            if (info.answers)
            insertProposalRecord.Item.answers = info.answers;
            dynamoDb.put(insertProposalRecord, (errInsertProposal, resultInsertProposal) => {
              if (!errInsertProposal) {
                sendProposalNotification(info.propertyOwnerId,
                  insertProposalRecord['Item']);
                callback({message: "Done", result: {insert: insertProposalRecord['Item']}});
              } else {
                callback({message: "Error Inserting Proposal", result: {error: errInsertProposal}});
              }
            });
          } else { // Proposal Already Accepted
            callback({message: "Proposal Already Accepted", result: {}});
          }
        } else {
          console.error("Error" + pErr);
          callback({message: "Database Error", result: {}});
        }
      });
    } else {
      callback({message: "Invalid Parameters", result: {}});
    }
  },
  updateProposalRecord: function(info, callback) {
    var proposalTableUpdate = {
       TableName: process.env.DYNAMODB_PROPOSALS_TABLE
    };
    var updateExpressionValue = 'SET #updated = :updatedvalue';
    var updateAttributeNames = {
      '#updated': 'updatedAt'
    };
    var updateAttributeValues = {
      ':updatedvalue': new Date().getTime()
    };
    var fieldsToChange = 0;
    if (info.proposalid !== undefined && info.changes !== undefined) {
      proposalTableUpdate['Key'] = {
        'id': info.proposalid
      };
      // Setting database entry (check if the update exists)
      function setDatabaseEntry(field,value) {
        if (isStringVariableSet(info.changes[field.toString()])) {
          updateExpressionValue = updateExpressionValue + ", #" + field+ " = :" + field;
          updateAttributeNames['#' + field] = field.toString();
          if (info.changes[field.toString()] !== '') {
            updateAttributeValues[':' + field] = info.changes[field.toString()];
          } else {
            updateAttributeValues[':' + field] = null;
          }
          fieldsToChange++;
        }
      }
      setDatabaseEntry("status", info.propertytype); // Set status
      proposalTableUpdate["ExpressionAttributeNames"] = updateAttributeNames;
      proposalTableUpdate["ExpressionAttributeValues"] = updateAttributeValues;
      proposalTableUpdate["UpdateExpression"] = updateExpressionValue;
      proposalTableUpdate["ReturnValues"] = 'ALL_NEW';
      dynamoDb.update(proposalTableUpdate, function(updatedbError, updatedbResult) {
        if (!updatedbError) {
          callback({message: "Done", result: {input: proposalTableUpdate, result: updatedbResult}});
        } else {
          callback({message: "Database error", result: {input: proposalTableUpdate, error: updatedbError}});
        }
      });
    } else {
      callback({message: "Require proposal ID and change details", result: {}});
    }
  },
  updateProposalRecordWithID: function(info, callback) {
    var proposalTableUpdate = {
       TableName: process.env.DYNAMODB_PROPOSALS_TABLE
    };
    var updateExpressionValue = 'SET #updated = :updatedvalue';
    var updateAttributeNames = {
      '#updated': 'updatedAt'
    };
    var updateAttributeValues = {
      ':updatedvalue': new Date().getTime()
    };
    var fieldsToChange = 0;
    if (info.proposalid !== undefined && info.changes !== undefined) {
      proposalTableUpdate['Key'] = {
        'id': info.proposalid
      };
      for(key in info.changes) {
        if (info.changes[key]) {
          updateExpressionValue += ", #" + key + " = :" + key;
          updateAttributeNames["#" + key] = key;
          updateAttributeValues[":" + key] = info.changes[key];
          fieldsToChange++;
        }
      }
      proposalTableUpdate["ExpressionAttributeNames"] = updateAttributeNames;
      proposalTableUpdate["ExpressionAttributeValues"] = updateAttributeValues;
      proposalTableUpdate["UpdateExpression"] = updateExpressionValue;
      proposalTableUpdate["ReturnValues"] = 'ALL_NEW';
      dynamoDb.update(proposalTableUpdate, function(updatedbError, updatedbResult) {
        if (!updatedbError) {
          callback({message: "Done", result: {input: proposalTableUpdate, result: updatedbResult}});
        } else {
          callback({message: "Database error", result: {input: proposalTableUpdate, error: updatedbError}});
        }
      });
    } else {
      callback({message: "Require proposal ID and change details", result: {}});
    }
  }
}
