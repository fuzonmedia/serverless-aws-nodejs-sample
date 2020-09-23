const parambyname = require('./parambyname');

test('Single Parameter', () => {
  expect(parambyname("a","http://localhost/?a=hello+world")).toBe("hello world");
});

test('Two Parameters', () => {
  expect(parambyname("b","http://localhost/?a=hello+world&b=goodbye+world")).toBe("goodbye world");
});

test('URL Encode', () => {
  expect(parambyname("a","http://localhost/?a=barry.teoh%40perceptinz.net+is+my+email&b=goodbye+world")).toBe("barry.teoh@perceptinz.net is my email");
});
