const verifyemail = require('./verifyemail');

// Tokens to be provided
const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';


test('No emailtoken provided', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  verifyemail({entrypoint: "GET"}, callback);
});

test('Seller token provided', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", token: validSellerUser});
    done();
  }

  verifyemail({entrypoint: "GET", httpGETRequest: {email: "seller@agents.com.au", emailtoken: "3169c67942abd3769067bdf2fd4eecd1"}}, callback);
});

test('dynamoDB connection - seller token FAILED', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  verifyemail({entrypoint: "GET", httpGETRequest: {email: "info@agents.com.au", emailtoken: "FAKE"}}, callback);
});

test('dynamoDB connection - Real seller token', (done) => {
    function callback(data) {
      expect(data).toMatchObject({message: "Done"});
      done();
    }

    verifyemail({entrypoint: "GET", httpGETRequest: {email: "info@agents.com.au", emailtoken: "emailtokenemailtoken"}}, callback);
});

test('Agent token provided', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", token: validAgentUser});
    done();
  }

  verifyemail({entrypoint: "GET", httpGETRequest: {email: "agent@agents.com.au", emailtoken: "52404b4a82a1bf2a8d1053d3843d016c"}}, callback);
});
