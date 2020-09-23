const verifytokenfunction = require('./verifytokenfunction');

test('token parameter NOT valid', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Not Found"});
    done();
  }

  verifytokenfunction("7f33cb2c74594ea9ddbbe3de2c4200ffinvalid", callback);
});

test('token parameter valid', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Found", usertype: "seller"});
    done();
  }

  verifytokenfunction("validsellerplaceholder", callback);
});

test('token parameter valid - placeholder seller', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Found", usertype: "seller"});
    done();
  }

  verifytokenfunction("validsellerplaceholder", callback);
});

test('token parameter valid - placeholder agent', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Found", usertype: "agent"});
    done();
  }

  verifytokenfunction("validagentplaceholder", callback);
});

test('token parameter valid - placeholder admin', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Found", usertype: "admin"});
    done();
  }

  verifytokenfunction("validadminplaceholder", callback);
});
