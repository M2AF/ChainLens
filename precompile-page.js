/**
 * precompile-page.js — compile the homepage's JSX once, on the server.
 *
 * public/index.html ships its app as <script type="text/babel"> (≈300 KB of
 * JSX inline plus /search-page.jsx), which @babel/standalone compiles in the
 * VISITOR's browser on every load. On a phone that is seconds of pegged CPU —
 * and inside the Magic Money wallet, whose dApp tabs share one WebView renderer
 * with the wallet UI, it froze the whole app until the compile finished.
 *
 * This module does that compile with esbuild instead, and serves a rewritten
 * index.html that loads plain scripts and no Babel. The source files are not
 * touched; they stay the editable, hand-written originals.
 *
 * Fail-safe by design: every rewrite must match exactly, and ANY mismatch or
 * compile error returns null — the caller then serves the original page, which
 * still works exactly as before (Babel in the browser). A future edit to
 * index.html can make this fall back; it can never make the site break.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let esbuild = null;
try { esbuild = require('esbuild'); } catch { /* not installed → always fall back */ }

const COMPILED_PREFIX = '/_compiled/';

// The Babel <script> tag and the library check that insists Babel is present.
// Matched literally so an unexpected edit falls back instead of half-rewriting.
const BABEL_TAG_RE = /[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone@[^"]+\/babel\.min\.js"><\/script>\r?\n/;
const BABEL_CHECK = " || typeof Babel === 'undefined'";
const BABEL_CHECK_LI_RE = /[ \t]*'<li>Babel: ' \+ \(typeof Babel !== "undefined" \? "✅ loaded" : "❌ MISSING"\) \+ '<\/li>' \+\r?\n/;

// <script type="text/babel" src="/x.jsx"></script>  or  <script type="text/babel">…</script>
const BABEL_SCRIPT_RE = /<script type="text\/babel"(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g;

function compileJsx(code, sourcefile) {
  return esbuild.transformSync(code, {
    loader: 'jsx',
    // React is a UMD global on this page, not an import.
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    sourcefile,
    // Whitespace/syntax only: identifier minification could rename top-level
    // names these classic scripts share through the global scope.
    minifyWhitespace: true,
    minifySyntax: true,
    legalComments: 'none',
  }).code;
}

function hashOf(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * @returns {{ html: string, assets: Map<string, string> } | null}
 *   `assets` maps a request path (/_compiled/…) to its JS source.
 */
function buildPrecompiledPage(publicDir, log = console) {
  if (!esbuild) {
    log.warn('[precompile] esbuild unavailable — serving the Babel page');
    return null;
  }
  try {
    const source = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const assets = new Map();

    let html = source;
    let scripts = 0;
    let failed = null;
    html = html.replace(BABEL_SCRIPT_RE, (_tag, src, inline) => {
      if (failed) return _tag;
      let code;
      let name;
      if (src) {
        // Only same-origin files under public/ — never a path that escapes it.
        const rel = src.replace(/^\//, '');
        const file = path.resolve(publicDir, rel);
        if (!file.startsWith(path.resolve(publicDir) + path.sep) || inline.trim()) {
          failed = `unexpected babel script src ${src}`;
          return _tag;
        }
        code = fs.readFileSync(file, 'utf8');
        name = path.basename(rel).replace(/\.jsx?$/, '');
      } else {
        code = inline;
        name = `inline-${scripts}`;
      }
      const js = compileJsx(code, src || `index.html#${name}`);
      const assetPath = `${COMPILED_PREFIX}${name}.${hashOf(js)}.js`;
      assets.set(assetPath, js);
      scripts += 1;
      return `<script src="${assetPath}"></script>`;
    });
    if (failed) throw new Error(failed);
    if (scripts === 0) throw new Error('no text/babel scripts found');

    // Drop Babel itself, and the load check that would now report it missing.
    const steps = [
      [BABEL_TAG_RE, ''],
      [BABEL_CHECK, ''],
      [BABEL_CHECK_LI_RE, ''],
    ];
    for (const [find, replacement] of steps) {
      const before = html;
      html = html.replace(find, replacement);
      if (html === before) throw new Error(`rewrite did not match: ${find}`);
    }
    if (/typeof Babel|text\/babel|babel\.min\.js/.test(html)) {
      throw new Error('Babel references remain after rewrite');
    }

    log.log(`[precompile] homepage compiled: ${scripts} scripts, ${[...assets.values()].reduce((n, s) => n + s.length, 0)} bytes`);
    return { html, assets };
  } catch (err) {
    log.error('[precompile] falling back to the Babel page:', err && err.message ? err.message : err);
    return null;
  }
}

/**
 * Express wiring. Rebuilds when index.html or a compiled source changes (so
 * `npm run dev` picks up edits without a restart); otherwise serves from memory.
 */
function createPrecompiledPage(publicDir, log = console) {
  let built = null;
  let stamp = '';

  const sourcesStamp = () => {
    const files = ['index.html', 'search-page.jsx'];
    return files.map(f => {
      try { return fs.statSync(path.join(publicDir, f)).mtimeMs; } catch { return 0; }
    }).join(':');
  };

  const current = () => {
    const now = sourcesStamp();
    if (now !== stamp) {
      stamp = now;
      built = buildPrecompiledPage(publicDir, log);
    }
    return built;
  };

  /** Send the homepage: precompiled when available, else the original file. */
  const sendPage = (req, res) => {
    const page = current();
    if (!page) return res.sendFile(path.join(publicDir, 'index.html'));
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(page.html);
  };

  /** Serve /_compiled/* — content-hashed, so safe to cache forever. */
  const sendAsset = (req, res, next) => {
    const page = current();
    const js = page && page.assets.get(req.path);
    if (!js) return next();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('application/javascript').send(js);
  };

  return { sendPage, sendAsset, current };
}

module.exports = { buildPrecompiledPage, createPrecompiledPage, COMPILED_PREFIX };
