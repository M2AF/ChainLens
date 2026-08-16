const express = require('express');
const path = require('path');

const app = express();
const root = path.resolve(__dirname, '..');

app.use(express.static(path.join(root, 'public')));
app.get('/app-hub-data.js', (_req, res) => res.sendFile(path.join(root, 'app-hub-data.js')));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));

app.listen(10777, '127.0.0.1', () => {
  console.log('ChainLens E2E static server listening on http://127.0.0.1:10777');
});
