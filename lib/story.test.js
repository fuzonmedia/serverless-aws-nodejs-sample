const story = require('./story');

test('Call function without any parameters', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Requires 'token' parameter"});
    done();
  }

  story({}, callback);
});

test('Call function with invalid token parameter', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  story({token: "invalid"}, callback);
});

test('Call function with valid token parameter for agents (Agents can list storys in their area)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", storys: []}); // Placeholder for now (Change at milestone 2)
    done();
  }

  story({token: "validagentplaceholder", entrypoint: "GET"}, callback);
});

test('Call function with valid token parameter for sellers (Seller can create storys)', (done) => {
  function callback(data) {
    expect(data).toMatchObject({"created": true, "message": "Done", "updated": false}); // Placeholder for now (Change at milestone 2)
    done();
  }

  story({token: "validsellerplaceholder", entrypoint: "POST", propertyidentifier: "identifier", propertyprice: "100000", propertytype: "land", propertyaddress1: "Address Line 1", propertystate: "NSW", propertypostcode: "2000"}, callback);
});



test('Call function with valid token parameter for sellers (Seller can create storys) - Invalid Price', (done) => {
  function callback(data) {
    expect(data).toMatchObject({"created": false, "updated": false, "message": "Property price needs to be greator than 0"}); // Placeholder for now (Change at milestone 2)
    done();
  }

  story({token: "validsellerplaceholder", entrypoint: "POST", propertyidentifier: "identifier", propertyprice: "0", propertytype: "land", propertyaddress1: "address", propertypostcode: "2000"}, callback);
});

test('Call function with valid token parameter for sellers (Seller can create storys) - No Price', (done) => {
  function callback(data) {
    expect(data).toMatchObject({"created": false, "updated": false, "message": "In order to create a story, you must have the following parameters: propertyprice, propertyidentifier"}); // Placeholder for now (Change at milestone 2)
    done();
  }

  story({token: "validsellerplaceholder", entrypoint: "POST", propertyidentifier: "identifier", propertytype: "land", propertyaddress1: "address", propertypostcode: "2000"}, callback);
});
