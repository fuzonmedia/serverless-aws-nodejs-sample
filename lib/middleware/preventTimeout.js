module.exports = () => (req, res, next) => {
  req.context.callbackWaitsForEmptyEventLoop = false
  return next()
}
