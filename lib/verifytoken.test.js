const verifytoken = require('./verifytoken');

test('No parameters', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Invalid Parameters"});
    done();
  }

  verifytoken({}, callback);
});

test('valid token', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }

  verifytoken({entrypoint: "GET", httpGETRequest: {"token": "validsellerplaceholder"}}, callback);
});

test('invalid token', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Access Denied"});
    done();
  }

  verifytoken({entrypoint: "GET", httpGETRequest: {"token": "invalid7f33cb2c74594ea9ddbbe3de2c4200ff"}}, callback);
});
