'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPrecompiledPage } = require('../precompile-page');

const quiet = { log() {}, warn() {}, error() {} };
const PUBLIC = path.join(__dirname, '..', 'public');

function tempSite(indexHtml, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-precompile-'));
  fs.writeFileSync(path.join(dir, 'index.html'), indexHtml);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

const BABEL_HEAD =
  '<script src="https://unpkg.com/@babel/standalone@7.27.6/babel.min.js"></script>\n';
const CHECK =
  "<script>if (typeof React === 'undefined' || typeof Babel === 'undefined') {\n" +
  "  x = '<li>Babel: ' + (typeof Babel !== \"undefined\" ? \"✅ loaded\" : \"❌ MISSING\") + '</li>' +\n" +
  "'';}</script>\n";

test('the real homepage compiles with no Babel left in it', () => {
  const page = buildPrecompiledPage(PUBLIC, quiet);
  assert.ok(page, 'expected the live index.html to precompile');
  assert.doesNotMatch(page.html, /typeof Babel|text\/babel|babel\.min\.js/);
  assert.ok(page.assets.size >= 2);
  for (const [p, js] of page.assets) {
    assert.match(p, /^\/_compiled\/[\w-]+\.[0-9a-f]{12}\.js$/);
    assert.ok(page.html.includes(`<script src="${p}"></script>`));
    assert.doesNotMatch(js, /<[A-Z][A-Za-z]*[\s/>]/, 'JSX should be compiled away');
  }
});

test('JSX becomes React.createElement and keeps script order', () => {
  const dir = tempSite(
    BABEL_HEAD + CHECK +
    '<script type="text/babel" src="/a.jsx"></script>\n' +
    '<script type="text/babel">const B = () => <b>two</b>;</script>\n',
    { 'a.jsx': 'const A = () => <i>one</i>;' },
  );
  const page = buildPrecompiledPage(dir, quiet);
  assert.ok(page);
  const [a, b] = [...page.assets.values()];
  assert.match(a, /React\.createElement\("i"/);
  assert.match(b, /React\.createElement\("b"/);
  assert.ok(page.html.indexOf('/_compiled/a.') < page.html.indexOf('/_compiled/inline-'));
});

test('falls back (null) when the Babel load check no longer matches', () => {
  // Someone reworded the check: rewriting half of it would show a false
  // "failed to load" screen, so the whole page must fall back instead.
  const dir = tempSite(BABEL_HEAD + '<script type="text/babel">const x = <p/>;</script>\n');
  assert.strictEqual(buildPrecompiledPage(dir, quiet), null);
});

test('falls back on a JSX syntax error', () => {
  const dir = tempSite(BABEL_HEAD + CHECK + '<script type="text/babel">const x = <p>;</script>\n');
  assert.strictEqual(buildPrecompiledPage(dir, quiet), null);
});

test('refuses a babel src outside public/', () => {
  const dir = tempSite(BABEL_HEAD + CHECK + '<script type="text/babel" src="/../secret.jsx"></script>\n');
  assert.strictEqual(buildPrecompiledPage(dir, quiet), null);
});
