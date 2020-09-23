const register = require('./register');

test('Call function without any parameters', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Registration requires a user type"});
    done();
  }

  register({}, callback);
});

// If seller
test('Call function as a seller type', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Email is required"});
    done();
  }
  register({"usertype": "seller"}, callback);
});

test('Seller, with propertytype but missing propertyaddress1 and email', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Email is required"});
    done();
  }

  register({"usertype": "seller", "propertytype": "apartment"}, callback);
});
test('Seller, with propertytype and propertyaddress but missing email', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Email is required"});
    done();
  }

  register({"usertype": "seller", "propertytype": "apartment", "propertyaddress1": "1 Fake St", "propertypostcode": "12345"}, callback);
});
test('Seller, with all details filled in - but email not valid', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Email does not appear to be valid"});
    done();
  }

  register({"usertype": "seller", "propertytype": "apartment", "propertyaddress1": "1 Fake St", "propertypostcode": "12345", "email": "not valid email"}, callback);
});


test('Seller, with all details filled in', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  register({"usertype": "seller", "propertytype": "apartment", "propertyaddress1": "1 Fake St", "propertyaddress2": "Address Line 2", "propertypostcode": "12345", "email": "info@agents.com.au", "password": "123456789"}, callback);
});

test('Seller, with all details filled in - apartment', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  register({"usertype": "seller", "propertytype": "apartment", "propertyaddress1": "1 Fake St", "propertycity": "City", "propertypostcode": "12345", "email": "info@agents.com.au", "password": "123456789"}, callback);
});

test('Seller, with all details filled in - land', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  register({"usertype": "seller", "propertytype": "land", "propertyaddress1": "1 Fake St", "propertyaddress2": "Address Line 2", "propertypostcode": "12345", "email": "info@agents.com.au", "password": "123456789"}, callback);
});

test('Seller, with all details filled in - house', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  register({"usertype": "seller", "propertytype": "house", "propertyaddress1": "1 Fake St", "propertycity": "City", "propertystate": "STATE", "propertypostcode": "12345", "email": "info@agents.com.au", "password": "123456789"}, callback);
});

test('Seller, with all details filled in (Special case email)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  register({"usertype": "seller", "propertytype": "apartment", "propertyaddress1": "1 Fake St", "propertypostcode": "12345", "email": "info+email@agents.com.au"}, callback);
});


// Different user types

// If Agent
test('Call function as an agent type', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Agent registration is missing parameters: email"});
    done();
  }

  register({"usertype": "agent"}, callback);
});

test('Agent - email not valid', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Email does not appear to be valid"});
    done();
  }

  register({"usertype": "agent", "email": "not valid email"}, callback);
});
test('Agent - email valid', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  register({"usertype": "agent", "email": "info@agents.com.au"}, callback);
});
test('Agent - email valid (Special Case #1)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }
  register({"usertype": "agent", "email": "info+1@agents.com.au"}, callback);
});

// If other / Empty
test('Call function using an empty user type', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Registration requires a user type"});
    done();
  }

  register({"usertype": ""}, callback);
});

// If Super Agent (Agent which can manage other Agents)
test('Call function as a Super Agent type', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Super Agent registration is missing the following parameter: email"});
    done();
  }

  register({"usertype": "superagent"}, callback);
});

// If Admin (Admin can manage the system)
test('Call function as an Admin type', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Admin registration is missing the following parameter: email"});
    done();
  }

  register({"usertype": "admin"}, callback);
});

// If type not existing
test('Call function as a type which does not exist', (done) => {
  var user_types_to_test = ["sdksdklasdj", "dsskdjsandkasdnkjas","random"];
  var user_types_to_test_length = user_types_to_test.length;
  function callback(data) {
    expect(data).toMatchObject({message: "That account type can not be registered"});
    done();
  }

  for (var i = 0; i < user_types_to_test_length; i++) {
    register({"usertype": user_types_to_test[i]}, callback);
  }
});
