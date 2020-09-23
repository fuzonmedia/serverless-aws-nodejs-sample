const sales = require('./sales');


const validSellerUser = 'validsellerplaceholder';
const validAgentUser = 'validagentplaceholder';
const validAdminUser = 'validadminplaceholder';
const recentSalesStubNoParams = [{agentidentifier: "agentidentifierplaceholder", saleidentifier: "saleid"}, {agentidentifier: "yyyy", saleidentifier: "saleid1"}];
const recentSalesStubParams = [{agentidentifier: "agentidentifierplaceholder", saleidentifier: "saleid"}];

test("GET request - no access token provided", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  sales({entrypoint: "GET"}, callback);
});
test("GET request - invalid access token (Agent)", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  sales({entrypoint: "GET", httpGETRequest: {token: validAgentUser}}, callback);
});
test("GET request - invalid access token (Admin)", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  sales({entrypoint: "GET", httpGETRequest: {token: validAdminUser}}, callback);
});

test("GET request - valid access token (Seller) - no parameters", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", sales: recentSalesStubNoParams});
    done();
  }

  sales({entrypoint: "GET", httpGETRequest: {token: validSellerUser}}, callback);
});
test("GET request - valid access token (Seller) - with agent_identifier parameter", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", sales: recentSalesStubParams});
    done();
  }

  sales({entrypoint: "GET", httpGETRequest: {token: validSellerUser, agent_identifier: "agentidentifierplaceholder"}}, callback);
});

// POST request
test("POST request - no token provided", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  sales({entrypoint: "POST", httpPOSTBody: "other=other"}, callback);
});
test("POST request - Seller token provided", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  sales({entrypoint: "POST", httpPOSTBody: "token=" + validSellerUser}, callback);
});
test("POST request - Agent token provided", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  sales({entrypoint: "POST", httpPOSTBody: "token=" + validAgentUser}, callback);
});
test("POST request - Admin token provided - no other parameters", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "In order to create a new sale record you must have the minimum information: propertytype, propertyaddress1, propertycity, propertypostcode"});
    done();
  }

  sales({entrypoint: "POST", httpPOSTBody: "token=" + validAdminUser}, callback);
});
test("POST request - Admin token provided - valid parameters", (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  sales({entrypoint: "POST", httpPOSTBody: "token=" + validAdminUser + "&propertytype=land&propertyaddress1=Address&propertycity=city&propertypostcode=2000"}, callback);
});
