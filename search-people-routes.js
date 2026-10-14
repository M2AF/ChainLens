const { isUuid } = require('./chat-service');
function mountPeopleSearch(app, { service, rateLimit, optionalAuth, blockedIds }) {
  app.get('/api/search/people', rateLimit, optionalAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (req.user && !isUuid(req.user.sub)) return res.status(401).json({ error: 'Invalid account session' });
      const result = await service.search({ q: req.query.q, address: req.query.address, chain: req.query.chain });
      const blocked = req.user ? await blockedIds(req.user.sub) : new Set();
      res.json({ ...result, people: result.people.filter(person => !blocked.has(person.id)) });
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'People search is temporarily unavailable' }); }
  });
}
module.exports = { mountPeopleSearch };
