const messages = require('./messages');

const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';
const validShortlistIdentifier = "valididentifier";
const invalidShortlistIdentifier = "invalididentifier";
const messagesStub = [];

test('GET: Messages API no token provided', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }
  messages({entrypoint: "GET"}, callback);
});

test('GET: Messages API - Admin token provided - No access', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }
  messages({entrypoint: "GET", httpGETRequest: {token: validAdminUser}}, callback);
});
test('GET: Messages API - Agent token provided - Access', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", messages: messagesStub});
    done();
  }

  messages({entrypoint: "GET", httpGETRequest: {token: validAgentUser}}, callback);
});
test('GET: Messages API - Seller token provided - Access', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", messages: messagesStub});
    done();
  }

  messages({entrypoint: "GET", httpGETRequest: {token: validSellerUser}}, callback);
});

test('POST: Messages API no token provided', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }
  messages({entrypoint: "POST"}, callback);
});
test('POST: Messages API - Admin token provided no access', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }
  messages({entrypoint: "POST", httpPOSTBody: "token=" + validAdminUser}, callback);
});
test('POST: Messages API - Agent token provided - Access (no parameters provided)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Message API requires the following: shortlistidentifier"});
    done();
  }
  messages({entrypoint: "POST", httpPOSTBody: "token=" + validAgentUser}, callback);
});
test('POST: Messages API - Agent token provided - Access (If already shortlisted)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }
  messages({entrypoint: "POST", httpPOSTBody: "token=" + validAgentUser + "&shortlistidentifier=" + validShortlistIdentifier}, callback);
});
test('POST: Messages API - Agent token provided - Access (If a shortlist identifier is not valid)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "The shortlist identifier is not valid"});
    done();
  }
  messages({entrypoint: "POST", httpPOSTBody: "token=" + validAgentUser + "&shortlistidentifier=" + invalidShortlistIdentifier}, callback);
});
test('POST: Messages API - Seller token provided - Access (no parameters provide)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Message API requires the following: shortlistidentifier"});
    done();
  }
  messages({entrypoint: "POST", httpPOSTBody: "token=" + validSellerUser}, callback);
});
