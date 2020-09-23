const debug = require('debug')('route::interview')
const { fetchAgentListings } = require('./api')
const { get } = require('lodash')

const verifyTokenFunction = require('./verifytokenfunction');
const userDBUtils = require('./userDatabaseUtils');
const proposalUtilsLib = require('./proposalDatabaseUtils');
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

module.exports = function(info, callback) {
  if (info.entrypoint == "GET") {
    if (info.httpGETRequest) {
      var data = info.httpGETRequest;
      var liststoryParams = {};
      verifyTokenFunction(data.token, function(validTokenCB) {
        if (validTokenCB.result && validTokenCB.message == "Found") {
          console.log("user :" + JSON.stringify(validTokenCB.result));

          // Call proposal table to count inverview set true
          proposalUtilsLib.listProposalRecord({
            ownerSellerId: validTokenCB.result.id,
            interviewSent :true
          }, function(proposalCB) {
            response.result={"num_interviews" : proposalCB.result.length };
            response.message="Done";
            callback(response);
          });
        } else {
          response.message = "Access denied";
          callback(response);
        }
      });
    } else {
      response.message = "Invalid request";
      callback(response);
    }
  } else if (info.entrypoint == "POST") {
    console.log("Interview : POST :" + JSON.stringify(info));
    if (info.httpPOSTBody && info.httpPOSTBody.token) {
      verifyTokenFunction(info.httpPOSTBody.token, function(validTokenCB) {
        if (validTokenCB.result && validTokenCB.message == "Found") {
          var data = info.httpPOSTBody;
          if (typeof data.proposal_id === 'undefined') {
            response.message="Error: proposal_id must be supplied in Body";
            callback(response);
          }

          if (typeof data.message === 'undefined') {
            response.message="Error: message must be supplied in Body";
            callback(response);
          }

          // Call proposal table to get proposal details
          proposalUtilsLib.listProposalRecord({
            proposalid : data.proposal_id
          }, function(proposalCB) {
            if(proposalCB.result.length==1) {
              if(typeof proposalCB.result[0]["interviewSent"]=== 'undefined' || !proposalCB.result[0]["interviewSent"]) {
                //send email to agent
                sendInterviewEmail(proposalCB.result[0]["agentData"]["email"],{"firstname":proposalCB.result[0]["agentData"]["firstname"],
                "usertype":"seller","sellername":validTokenCB.result.firstname+" "+validTokenCB.result.lastname,"selleraddress":"","sellersuburb":"","selleremail":validTokenCB.result.email,"sellerphone":validTokenCB.result.contactnumber,"message":data.message}
                ,function(err,res){
                  console.log(res);
                  console.log(err);
                  if(err) {
                    response.message="Error in sending email: "+ err;
                    callback(response);
                  }
                  //Save in database
                  var current_time=new Date().getTime();
                    proposalUtilsLib.updateProposalRecordWithID({proposalid: proposalCB.result[0]["id"], changes: {interviewSent: true,sentIntervieRequestDetails:{message :data.message , timeStamp : current_time}}}, function(updateProposalCB) {
                      console.log("Interview : Update :" + JSON.stringify(updateProposalCB));
                      if (updateProposalCB.message == "Done") {
                        response.message="Done";
                        response.result="Interview request accepted"
                        callback(response);
                      }
                      else {
                        console.error("Unable to update Proposal : "+updateProposalCB);
                        response.message="Unable to update Proposal";
                        callback(response);
                      }
                    });
                });
              }
              else {
                response.message="Done";
                response.result="Interview request already sent"
                callback(response);
              }

            }
          });
        } else {
          response.message = "Access denied";
          callback(response);
        }
      });
    } else {
      response.message = "Invalid request";
      callback(response);
    }
  } else {
    response.message = "Invalid method";
    callback(response);
  }

  /**
   * Send interview request email via sendgrid
   */
  function sendInterviewEmail(email,details,callback) {
    // Build the email
    var from_email = new helper.Email('support@agents.com.au', " Agents");
    var to_email = new helper.Email(email.toString());
    var mail = new helper.Mail();
    mail.setFrom(from_email);
    mail.setSubject('Interview Request');
    const personalization = new helper.Personalization();
    personalization.addTo(to_email);
    personalization.addSubstitution(
      new helper.Substitution('-firstname-', details.firstname.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-sellername-', details.sellername.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-selleraddress-', details.selleraddress.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-sellersuburb-', details.sellersuburb.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-selleremail-', details.selleremail.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-sellerphone-', details.sellerphone.toString()));
    personalization.addSubstitution(
      new helper.Substitution('-message-', details.message.toString()));

    mail.addPersonalization(personalization);
    if (details.usertype == 'seller') {
      mail.setTemplateId('d3f131e7-b484-4101-a158-187a97d28c53');
    } else if (details.usertype == 'agent') {
      mail.setTemplateId('03ad4271-f629-42cd-b783-39c01b1cc4b6');
    }

    // Send off the email
    var request = sg.emptyRequest({
      method: 'POST',
      path: '/v3/mail/send',
      body: mail.toJSON(),
    });
    sg.API(request, function (error, response) {
      //console.log(response.statusCode);
      //console.log(response.body);
      //console.log(response.headers);
      callback(error,response);
    });
  }
};
