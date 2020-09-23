const shortlist = require('./shortlist');
const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';
const shortlistedPropertiesStub = [];

test('HTTP GET - No Access token to this service', (done) => {
  function callback(data) {
    expect(data).toEqual({message: "Access Denied"});
    done();
  }

  shortlist({entrypoint: "GET"}, callback);
});
test('HTTP POST - No Access token to this service', (done) => {
  function callback(data) {
    expect(data).toEqual({message: "Access Denied"});
    done();
  }

  shortlist({entrypoint: "POST"}, callback);
});

test('Invalid Access token to this service - Agent', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  shortlist({entrypoint: "GET", httpGETRequest: {token: validAgentUser}}, callback);
});
test('Invalid Access token to this service - Admin', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }
  shortlist({entrypoint: "GET", httpGETRequest: {token: validAdminUser}}, callback);
});
test('Valid Access token to this service - Seller (No Parameters - GET)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", shortlist: []});
    done();
  }
  shortlist({entrypoint: "GET", httpGETRequest: {token: validSellerUser}}, callback);
});

test('Valid Access token to this service - Seller (No Parameters - POST)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Shortlist service requires the following parameters: token, proposalidentifier"});
    done();
  }
  shortlist({entrypoint: "POST", httpPOSTBody: "token=" + validSellerUser}, callback);
});
test('Valid Access token to this service - Seller (Proposal Identifier - POST)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }
  shortlist({entrypoint: "POST", httpPOSTBody: "token=" + validSellerUser + "&proposalidentifier=identifier"}, callback);
});
