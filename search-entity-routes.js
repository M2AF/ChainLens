function mountEntitySearch(app, { assets, transactions, rateLimit }) {
  const respond = fn => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await fn(req.query)); }
    catch (error) { res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'Search provider is temporarily unavailable.' }); }
  };
  app.get('/api/search/assets', rateLimit, respond(q => assets.search({ q: q.q, chain: q.chain || '', kind: q.kind })));
  app.get('/api/search/transaction', rateLimit, respond(q => transactions.search({ chain: q.chain, hash: q.hash })));
}
module.exports = { mountEntitySearch };
