const debug = require('debug')('route::sendbird-webhook')
const { fetchAgentListings } = require('./api')
const { get } = require('lodash')

const userDBUtils = require('./userDatabaseUtils');
// Sendgrid stuff
var helper = require('sendgrid').mail;
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY)

const response = {
  message: 'Access Denied',
}
const defaultHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
}

/**
 * Sendbird notification handler
 *
 * @param {*} event
 * @param {*} context
 * @param {*} callback
 */
module.exports.post = (event, context, callback) => {

  context.callbackWaitsForEmptyEventLoop = false

  function response(body, statusCode, headers = {}) {
    if (typeof body !== 'string') {
      body = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }

    callback(null, {
      statusCode,
      body,
      headers: Object.assign(defaultHeaders, headers),
    })
  }

  if (event.httpMethod !== 'POST') {
    response({
      message: 'Error: Invalid method type'
    }, 400)
    return
  }

  var params = JSON.parse(event.body);
  console.log(params);
  if(params.app_id && params.app_id==process.env.SENDBIRD_APP_ID) {
    // capture group_channel:message_send
    if(params.category && params.category =='group_channel:message_send' && params.type && params.type =='MESG') {
      if(params.sender && params.sender.user_id && params.payload.message) {
        var sender_id = params.sender.user_id;
        var sender_name = params.sender.nickname;
        var message = params.payload.message;
        var receipients= [];
        if(params.members) {
          for(member in params.members) {
            if(sender_id!=params.members[member].user_id) {
              if(params.members[member].user_id && params.members[member].nickname && !params.members[member].is_online && params.members[member].is_active) {
                  receipients.push({'user_id' : params.members[member].user_id , 'nickname' : params.members[member].nickname});
              }

            }
          }
          //console.log(sender_id);
          //console.log(receipients);
          if(receipients.length==1) {
            // query DB to get user email
            userDBUtils.checkUserByField('id', receipients[0].user_id).then(user => {
              if (user === null) {
                // No user found
                console.log('No user found to send email ');
                  response({
                    message: 'No user found to send email '
                  }, 200)
                  return
              }
              else {
                if (user.email && user.emailVerified) {
                  // send email to user
                  console.error("Email to : "+user.email);
                  sendChatMessageToEmail(user.email,{"receivername":user.firstname,"sendername":sender_name,"message":message,"uid" : sender_id}
                  ,function(err,res){
                    if(err) {
                      console.log(err);
                      response({
                        message: "Error in sending email: "+ err
                      }, 400)
                      return
                    }
                    response({
                      message: 'Data posted'
                    }, 200)
                    return
                  });
                }
                else {
                    console.log('Email is not valid or verified . Unable to send email');
                }
              }
            });
          }
          else {
            response({
              message: 'Invalid details'
            }, 200)
            return
          }
        }
        else {
          response({
            message: 'Invalid details'
          }, 200)
          return
        }
      }
      else {
        response({
          message: 'Invalid details'
        }, 200)
        return
      }
    }
    else {
      response({
        message: 'Method yet not implemented'
      }, 200)
      return
    }
  }

  /**
   * Send unread chat message to email via sendgrid when user offline
   */
  function sendChatMessageToEmail(email,details,callback) {
    // Build the email
    var from_email = new helper.Email('support@agents.com.au', " Agents");
    var to_email = new helper.Email(email.toString());
    var mail = new helper.Mail();
    mail.setFrom(from_email);
    mail.setSubject('Chat Message from agents');
    const personalization = new helper.Personalization();
    personalization.addTo(to_email);
    personalization.addSubstitution(
      new helper.Substitution('-receivername-', details.receivername.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-sendername-', details.sendername.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-message-', details.message.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-uid-', details.uid.toString()));


    mail.addPersonalization(personalization);

    mail.setTemplateId('2b32b3e9-9df9-4cdc-85a6-5fb6bb0522dc');

    // Send off the email
    var request = sg.emptyRequest({
      method: 'POST',
      path: '/v3/mail/send',
      body: mail.toJSON(),
    });
    sg.API(request, function (error, response) {
      callback(error,response);
    });
  }
}
