const property = require('./property');

const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';

test('GET - Agents can not access this endpoint', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  property({entrypoint: "GET", httpGETRequest: {token: validAgentUser}}, callback);
});

test('GET - Admins can not access this endpoint', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  property({entrypoint: "GET", httpGETRequest: {token: validAdminUser}}, callback);
});

test('GET - Sellers can access this endpoint', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  property({entrypoint: "GET", httpGETRequest: {token: validSellerUser}}, callback);
});

test('GET - INVALID TOKEN', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  property({entrypoint: "GET", httpGETRequest: {token: "accessdenied"}}, callback);
});

test('POST - Agents can not access this endpoint', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  property({entrypoint: "POST"}, callback);
});

test('POST - Admins can not access this endpoint', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  property({entrypoint: "POST"}, callback);
});
test('POST - Sellers can access this endpoint (No Parameters)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Requires: propertyidentifier and changetype (either 'property' or 'addphoto')"});
    done();
  }

  property({entrypoint: "POST", httpPOSTBody: "token=" + validSellerUser}, callback);
});

test('POST - Sellers can access this endpoint (Parameters)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  property({entrypoint: "POST", httpPOSTBody: "token=" + validSellerUser + "&propertyidentifier=e4b2ee90-f286-11e6-b1fb-0f6cede30981&changetype=property"}, callback);
});

test('POST - Sellers can access this endpoint - But propertyidentifier not correct', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Requires: propertyidentifier and changetype (either 'property' or 'addphoto')"});
    done();
  }

  property({entrypoint: "POST", httpPOSTBody: "token=" + validSellerUser + "&propertyidentifier=incorrect"}, callback);
});

test('POST - Agents cant access this endpoint (Parameters)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  property({entrypoint: "POST", httpPOSTBody: "token=" + validAgentUser + "&propertyidentifier=e4b2ee90-f286-11e6-b1fb-0f6cede30981"}, callback);
});

test('POST - INVALID Token ', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  property({entrypoint: "POST", httpPOSTBody: "token=accessdenied&propertyidentifier=e4b2ee90-f286-11e6-b1fb-0f6cede30981"}, callback);
});
