const debug = require('debug')('sendgrid-helper')
const SendGrid = require('sendgrid')
const client = new SendGrid(process.env.SENDGRID_API_KEY)
const { Email, Mail, Personalization, Substitution, MailSettings } = SendGrid.mail

const parseEmailInput = (email) => {
  if (email instanceof Email) {
    return email
  }

  if (typeof email === 'string') {
    return new Email(email)
  }

  if (Array.isArray(email)) {
    return new Email(...email)
  }

  if (typeof email === 'object' && email.address) {
    return new Email(email.address, email.name)
  }

  throw new Error('Invalid email input')
}

let mailsCount = 0

module.exports.client = client
module.exports.send = ({
  from = null,
  to = null,
  mail = new Mail(),
  personalization = new Personalization(),
  templateId = null,
  subject = null,
  substitutions = {},
  sandbox = false,
}) => {
  if (!mail instanceof Mail) {
    throw new Error('Invalid mail object')
  }
  if (!personalization instanceof Personalization) {
    throw new Error('Invalid personalization object')
  }

  from = (from === null) ? new Email('support@agents.com.au', ' Agents') : parseEmailInput(from)
  mail.setFrom(from)

  if (to !== null) {
    personalization.addTo(parseEmailInput(to))
  }

  if (subject !== null) {
    mail.setSubject(subject)
  }

  for (let key in substitutions) {
    personalization.addSubstitution(new Substitution(key, substitutions[key]))
  }

  if (templateId !== null) {
    mail.setTemplateId(templateId)
  }

  if (personalization.getTos() && personalization.getTos().length > 0) {
    mail.addPersonalization(personalization)
  }

  const settings = new MailSettings()
  if (sandbox) {
    settings.setSandBoxMode({enable: true})
  }
  mail.addMailSettings(settings)

  const request = client.emptyRequest({
    method: 'POST',
    path: '/v3/mail/send',
    body: mail.toJSON(),
  })

  mailsCount++
  debug(`Dispatching SendGrid request (${mailsCount}): ${JSON.stringify(request)}`)
  return client.API(request).then(response => {
    debug(`Received SendGrid Response (${mailsCount}): ${JSON.stringify(response)}`)
    return response
  }).catch(error => {
    debug(`SendGrid Error: ${JSON.stringify(error)}`)
    throw error
  })
}
