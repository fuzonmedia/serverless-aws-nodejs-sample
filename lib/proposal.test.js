const proposal = require('./proposal');
const placeHolderProposals = [];

test('Proposal requires a valid token', (done) => {
  function callback(data) {
    expect(data).toEqual({message: "Access Denied"});
    done();
  }

  proposal({}, callback);
});
test('Proposal requires a valid token - token provided by not working', (done) => {
  function callback(data) {
    expect(data).toEqual({message: "Access Denied"});
    done();
  }

  proposal({token: "dskaosdjakljewkq", entrypoint: "GET"}, callback);
});

test('Agent can not list proposals', (done) => {
  function callback(data) {
    expect(data).toEqual({message: "Access Denied"});
    done();
  }

  proposal({token: "validagentplaceholder", entrypoint: "GET"}, callback);
});

test('Agent can create a proposal - invalid parameters', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "In order to create a proposal you need the following at the minimum: token, storyidentifier, storyowner, proposalnote"});
    done();
  }
  proposal({token: "validagentplaceholder", entrypoint: "POST"}, callback);
});

test('Agent can create a proposal', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"});
    done();
  }
  proposal({token: "validagentplaceholder", entrypoint: "POST", storyidentifier: "storyidentifier", storyowner: "owneridentifier", proposalnote: "This is a proposal by an agent"}, callback);
});

test('Sellers can not create a proposal -> However t will see a different message', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Required Parameters: proposalidentifier, acceptproposal"});
    done();
  }
  proposal({token: "validsellerplaceholder", entrypoint: "POST", storyidentifier: "storyidentifier", storyowner: "owneridentifier", proposalnote: "This is a proposal by an agent"}, callback);
});

test('Sellers can list proposals received by an agent', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", proposals: placeHolderProposals}); // Placeholder Proposals
    done();
  }

  proposal({token: "validsellerplaceholder", entrypoint: "GET"}, callback);
});
test('Seller - proposal identifier is missing when trying to accept a proposal', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "In order to accept or decline a proposal you need to specify the identifier"});
    done();
  }

  proposal({token: "validsellerplaceholder", entrypoint: "POST", acceptproposal: 1}, callback);
});
test('Sellers can accept a proposal', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"}); // Placeholder Proposals
    done();
  }

  proposal({token: "validsellerplaceholder", entrypoint: "POST", acceptproposal: 1, proposalidentifier: "identifier"}, callback);
});
test('Sellers can reject a proposal', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done"}); // Placeholder Proposals
    done();
  }

  proposal({token: "validsellerplaceholder", entrypoint: "POST", acceptproposal: 0, proposalidentifier: "identifier"}, callback);
});

test('Admins can not create a proposal', (done) => {
  function callback(data) {
    expect(data).toEqual({message: "Access Denied"});
    done();
  }
  proposal({token: "validadminplaceholder", entrypoint: "POST", storyidentifier: "storyidentifier", storyowner: "owneridentifier", proposalnote: "This is a proposal by an agent"}, callback);
});
test('Admins can list all the proposals', (done) => {
  function callback(data) {
    expect(data).toMatchObject({message: "Done", proposals: placeHolderProposals}); // Placeholder Proposals
    done();
  }

  proposal({token: "validadminplaceholder", entrypoint: "GET"}, callback);
});
