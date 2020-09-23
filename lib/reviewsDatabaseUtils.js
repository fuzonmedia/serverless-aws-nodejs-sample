const debug = require('debug')('utils::reviews')
const { get, reduce, has, sum, pick } = require('lodash')
const parambyname = require('./parambyname');

const dynamoDb = require('./util/dynamodb')
const { makeQueryExpressionParams } = dynamoDb

const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';

const userUtilsLib = require('./userDatabaseUtils');

var helper = require('sendgrid').mail;
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY);


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

const emailTemplates = {
  newAgent: '31129b04-be50-4d9e-aa94-afd77a525e16',
  existingAgent: 'f157ee95-1552-44b1-855f-d0b0f9369994',
}

const sendEmailNotification = ({
  reviewedEmail,
  agentFirstName,
  agentLastName,
  reviewerFirstName,
  ratingdescription,
  reviewerSuburb = null,
}, averageRating, templateName = 'newAgent') => {
  const agentName = `${agentFirstName} ${agentLastName}`.trim()
  const to_email = new helper.Email(reviewedEmail, agentName.length > 0 ? agentName : undefined);
  const from_email = new helper.Email('support@agents.com.au', " Agents");
  const subject = `Claim your review from ${reviewerFirstName} on  Agents`
  const content = new helper.Content('text/html', ratingdescription);
  const mail = new helper.Mail(from_email, subject, to_email, content);

  personalization  = new helper.Personalization();
  personalization.addTo(to_email);
  personalization.addSubstitution(
    new helper.Substitution('-firstName-', agentFirstName));
  personalization.addSubstitution(
    new helper.Substitution('-lastName-', agentLastName));
  personalization.addSubstitution(
    new helper.Substitution('-averageRating-', averageRating.toFixed(2).toString()));
  personalization.addSubstitution(
    new helper.Substitution('-reviewPercent-', Math.floor(averageRating * 20).toString()));
  var reviewerString = reviewerFirstName;
  if (reviewerSuburb) {
    reviewerString += ` from ${reviewerSuburb}`;
  }
  personalization.addSubstitution(
    new helper.Substitution('-reviewer-', reviewerString));
  mail.addPersonalization(personalization);
  mail.setTemplateId(get(emailTemplates, templateName, '31129b04-be50-4d9e-aa94-afd77a525e16'));

  // Send off the email
  var request = sg.emptyRequest({
    method: 'POST',
    path: '/v3/mail/send',
    body: mail.toJSON(),
  });
  debug(`Dispatching SendGrid request with [${templateName}] template to ${reviewedEmail}`)
  return sg.API(request).then(response => {
    debug('Received response from SendGrid')
    debug(response.statusCode);
    debug(response.body);
    debug(response.headers);
  });
}

module.exports = {
  addReviewProperty: function(input) {
    return new Promise(resolve => {
    const missing = reduce(
      [
        'reviewerFirstName',
        'reviewerLastName',
        'propertyAddress',
        'reviewerEmail',
        'communicationRating',
        'negotiationRating',
        'presentationRating',
        'marketKnowledgeRating',
        'marketingStrategyRating',
        'customerServiceRating',
      ],
      (result, value) => {
        if (!has(input, value)) {
          result.push(`Missing required parameter: ${value}`)
        }
        return result
      }, []
    )
    if (missing.length > 0) {
      debug(`Reviews are missing required parameters: ${missing.join(', ')}.`)
      return resolve({message: "Reviews are missing required parameters"});
    }

    let validRatings = true
    const ratings = []

    const info = reduce([
      'communicationRating',
      'negotiationRating',
      'presentationRating',
      'marketKnowledgeRating',
      'marketingStrategyRating',
      'customerServiceRating',
    ], (result, value) => {
      result[value] = parseInt(info[value], 10)
      ratings.push(result[value])
      if (result[value] < 1 || result[value] > 5) {
        validRatings = false
      }
      return result
    }, input)

    if (!validRatings) {
      return resolve({message: "Ratings must be between 1 and 5"});
    }

        let hasreviewed;
        if (info.reviewerIdentifier && info.reviewedUserId) {
          hasreviewed = {
             TableName: process.env.DYNAMODB_REVIEWS_TABLE,
             ExpressionAttributeNames: {
               '#useridentifier': 'reviewedUserId',
               '#reviewedBy': 'reviewerIdentifier'
             },
             FilterExpression: '#useridentifier = :useridentifier AND #reviewedBy = :reviewedBy',
             ExpressionAttributeValues: {
               ':useridentifier': info.reviewedUserId,
               ':reviewedBy': info.reviewerIdentifier
             }
          };
        } else if (info.reviewedUserId) {
          hasreviewed = {
             TableName: process.env.DYNAMODB_REVIEWS_TABLE,
             ExpressionAttributeNames: {
               '#useridentifier': 'reviewedUserId',
               '#reviewerLastName': 'reviewerLastName',
               '#reviewerEmail': 'reviewerEmail'
             },
             FilterExpression: '#useridentifier = :useridentifier AND #reviewerLastName = :reviewerLastName AND #reviewerEmail = :reviewerEmail',
             ExpressionAttributeValues: {
               ':useridentifier': info.reviewedUserId,
               ':reviewerLastName': info.reviewerLastName,
               ':reviewerEmail': info.reviewerEmail
             }
          };
        } else {
          hasreviewed = {
             TableName: process.env.DYNAMODB_REVIEWS_TABLE,
             ExpressionAttributeNames: {
               '#useridentifier': 'reviewedUserEmail',
               '#reviewerLastName': 'reviewerLastName',
               '#reviewerEmail': 'reviewerEmail'
             },
             FilterExpression: '#useridentifier = :useridentifier AND #reviewerLastName = :reviewerLastName AND #reviewerEmail = :reviewerEmail',
             ExpressionAttributeValues: {
               ':useridentifier': info.reviewedEmail,
               ':reviewerLastName': info.reviewerLastName,
               ':reviewerEmail': info.reviewerEmail
             }
          };
        }

        debug(`Running scan query: ${JSON.stringify(hasreviewed)}`)

    dynamoDb.scanAsync(hasreviewed).catch(hasreviewedqueryError => {
      return resolve({
        message: "Error getting review information",
        error: hasreviewedqueryError
      })
    }).then(hasreviewedqueryResult => {
      if (hasreviewedqueryResult.Count > 0) {
        return resolve({
          message: "User already reviewed agent"
        })
      }

      const averageRating = sum(ratings) / ratings.length
      const now = new Date().getTime()
      const reviewdbparams = {
        TableName: process.env.DYNAMODB_REVIEWS_TABLE,
        Item: Object.assign({}, pick(info, [
          'reviewerFirstName',
          'reviewerLastName',
          'reviewerEmail',
          'propertyAddress',
          'soldMonth',
          'communicationRating',
          'presentationRating',
          'negotiationRating',
          'marketKnowledgeRating',
          'marketingStrategyRating',
          'customerServiceRating',
        ]), {
          averageRating,
          createdAt: now,
          updatedAt: now,
        })
      }

      if (info.reviewerIdentifier) {
        reviewdbparams.Item.reviewerIdentifier = info.reviewerIdentifier;
      }
      if (info.ratingdescription) {
        reviewdbparams.Item.ratingdescription = info.ratingdescription;
      }

        if (info.reviewedUserId) {
          reviewdbparams.Item.reviewedUserId = info.reviewedUserId;
          userUtilsLib.getUserRecord({useridentifier: info.reviewedUserId}, function(checkuserCB) {
            if (checkuserCB.message == "Done") {
              if (checkuserCB.result['usertype'] == "agent") {
                info.reviewedEmail = checkuserCB.result['email']
                info.agentFirstName = checkuserCB.result['firstname']
                info.agentLastName = checkuserCB.result['lastname']
                dynamoDb.put(reviewdbparams, (reviewInsertErr, reviewInsertResult) => {
                  if (reviewInsertErr) {
                    console.error(reviewInsertErr);
                    resolve({message: "Error", error: reviewInsertErr});
                  } else { // Created
                    sendEmailNotification(info, averageRating, 'existingAgent').catch(e => {
                      debug(`SengDrid error: ${e.message}`)
                    })
                    resolve({message: "Done", review: reviewdbparams['Item']});
                  }
                });
              } else {
                resolve({message: "Can only review agents"});
              }
            } else {
              resolve({message: "User needs to exist before we can review them"});
            }
          });
        } else {
          reviewdbparams.Item.reviewedUserEmail = info.reviewedEmail;
          dynamoDb.put(reviewdbparams, (reviewInsertErr, reviewInsertResult) => {
            if (reviewInsertErr) {
              console.error(reviewInsertErr);
              resolve({message: "Error", error: reviewInsertErr});
            } else { // Created
              if (averageRating >= 4) {
                sendEmailNotification(info, averageRating, 'newAgent').catch(e => {
                  debug(`SengDrid error: ${e.message}`)
                })
              }
              resolve({message: "Done", review: reviewdbparams['Item']});
            }
          });
        }
      })
    })
  },
  fetchReviewsForUsers: (users, queryParams = {}) => {
    const query = makeQueryExpressionParams('reviewedUserId', users, 'scan')
    query.TableName = process.env.DYNAMODB_REVIEWS_TABLE
    return dynamoDb.scanAsync(Object.assign(queryParams, query)).then(({ Items }) => Items)
  },
  fetchReviewsByUserId: function(info, callback) {
    if (isStringVariableSet(info.useridentifier)) {
      var userreviewquery = {
         TableName: process.env.DYNAMODB_REVIEWS_TABLE,
         ExpressionAttributeNames: {
           '#useridentifier': 'reviewedUserId'
         },
         FilterExpression: '#useridentifier = :useridentifier',
         ExpressionAttributeValues: {
           ':useridentifier': info.useridentifier}
      };
      dynamoDb.scan(userreviewquery, function(userreviewqueryError, userreviewqueryResult) {
        if (!userreviewqueryError) {
          var theReviews = [];
          var reviewAverageRating = 0;
          var communicationAverageRating = 0;
          var negotiationAverageRating = 0;
          var presentationAverageRating = 0;
          var customerServiceAverageRating = 0;
          var marketKnowledgeAverageRating = 0;
          var marketingStrategyAverageRating = 0;
          var reviewSum = 0; var communicationSum = 0;
          var negotiationSum = 0; var presentationSum = 0; var marketKnowledgeSum = 0; var marketingStrategySum = 0;
          var customerServiceSum = 0;

          for (var i = 0; i < userreviewqueryResult.Items.length; i++) {
            var reviewEntry = userreviewqueryResult.Items[i];
            reviewSum += parseFloat(reviewEntry['averageRating']);
            communicationSum += parseInt(reviewEntry['communicationRating']);
            negotiationSum += parseInt(reviewEntry['negotiationRating']);
            presentationSum += parseInt(reviewEntry['presentationRating']);
            customerServiceSum += parseInt(reviewEntry['customerServiceRating']);
            marketKnowledgeSum += parseInt(reviewEntry['marketKnowledgeRating']);
            marketingStrategySum += parseInt(reviewEntry['marketingStrategyRating']);

            var addressLine1 = reviewEntry['propertyAddress'].split(",")[0];
            var suburb = reviewEntry['propertyAddress'].split(",")[1];

            var propertyAddress = addressLine1.replace(/[0-9]+\w*\/*[0-9]*\-{0,1}[\d\w]*\b/g,'');
            propertyAddress += ", " + suburb;
            theReviews.push({
              identifier: reviewEntry['id'],
              averageRating: reviewEntry['averageRating'],
              communicationRating: reviewEntry['communicationRating'],
              negotiationRating: reviewEntry['negotiationRating'],
              customerServiceRating: reviewEntry['customerServiceRating'],
              presentationRating: reviewEntry['presentationRating'],
              marketKnowledgeRating: reviewEntry['marketKnowledgeRating'],
              marketingStrategyRating: reviewEntry['marketingStrategyRating'],
              review: reviewEntry['ratingdescription'],
              reviewBy: reviewEntry['reviewerIdentifier'],
              reviewerFirstName: reviewEntry['reviewerFirstName'],
              createdAt: reviewEntry['createdAt'],
              updatedAt: reviewEntry['updatedAt'],
              soldMonth: reviewEntry['soldMonth'],
              propertyAddress: propertyAddress
            });
          }
          if (userreviewqueryResult.Items.length > 0) {
            reviewAverageRating = reviewSum / parseFloat(userreviewqueryResult.Items.length);
            communicationAverageRating = communicationSum / parseFloat(userreviewqueryResult.Items.length);
            negotiationAverageRating = negotiationSum / parseFloat(userreviewqueryResult.Items.length);
            customerServiceAverageRating = customerServiceSum / parseFloat(userreviewqueryResult.Items.length);
            presentationAverageRating = presentationSum / parseFloat(userreviewqueryResult.Items.length);
            marketKnowledgeAverageRating = marketKnowledgeSum / parseFloat(userreviewqueryResult.Items.length);
            marketingStrategyAverageRating = marketingStrategySum / parseFloat(userreviewqueryResult.Items.length);
          }
          callback({message: "Done", reviews: theReviews, averageRating: reviewAverageRating, communicationAverage: communicationAverageRating, negotiationAverage: negotiationAverageRating, presentationAverage: presentationAverageRating, customerServiceAverage: customerServiceAverageRating, marketKnowledgeAverage: marketKnowledgeAverageRating, marketingStrategyAverage: marketingStrategyAverageRating });
        } else {
          callback({message: "Error", error: userreviewqueryError});
        }
      });
    } else {
      callback({message: "Listing reviews requires the following: 'useridentifier'"});
    }
  },
  associateExistingReviews: function(email, id) {
    var reviewTableUpdate = {
       TableName: process.env.DYNAMODB_REVIEWS_TABLE
    };
    var updateExpressionValue = 'SET #updated = :updatedvalue, #userid = :userid';
    var updateAttributeNames = {
      '#updated': 'updatedAt',
      "#userid": 'reviewedUserId'
    };
    var updateAttributeValues = {
      ':updatedvalue': new Date().getTime()
    };

    var userreviewquery = {
       TableName: process.env.DYNAMODB_REVIEWS_TABLE,
       ExpressionAttributeNames: {
         '#useridentifier': 'reviewedUserEmail'
       },
       FilterExpression: '#useridentifier = :useridentifier',
       ExpressionAttributeValues: {
         ':useridentifier': email}
    };
    dynamoDb.scan(userreviewquery, function(userreviewqueryError, userreviewqueryResult) {
      for (var i = 0; i < userreviewqueryResult.Items.length; i++) {
        var reviewEntry = userreviewqueryResult.Items[i];
        reviewTableUpdate['Key'] = {
          'id': reviewEntry.id
        };
        updateAttributeValues[":userid"] = id;
        reviewTableUpdate["ExpressionAttributeNames"] = updateAttributeNames;
        reviewTableUpdate["ExpressionAttributeValues"] = updateAttributeValues;
        reviewTableUpdate["UpdateExpression"] = updateExpressionValue;
        reviewTableUpdate["ReturnValues"] = 'ALL_NEW';
        dynamoDb.update(reviewTableUpdate, function(updatedbError, updatedbResult) {
          if (updatedbError) {
            console.log("Error associating reviews: " + updatedbError);
          }
        });
      }
    });
  }
}
