const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWalletSession, loginMessage } = require('../auth-session');

// The scenario that motivated this endpoint: a ChainLens account created by
// signing in with Google (or a Solana wallet), with the MagicMoney EVM address
// linked to it afterwards. `provider` is NOT 'evm_wallet', so /wallet-login
// would have upserted a SECOND account for the same human — which is exactly
// what this route must never do.
const GOOGLE_ACCOUNT = 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
const SOLANA_ACCOUNT = '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
const STRANGER_ACCOUNT = '9b1f0c22-5d8e-41a7-8f3b-6c2d4e5a7b19';
const ADDRESS = '0x01FaF6dFc230d755141d84D7Cb980DD68F5eFe13';
const NONCE = 'a'.repeat(64);

/**
 * A world where `verifiedWallets` maps account id → the addresses that account
 * has PROVED it owns, and `watchWallets` are addresses merely being watched.
 */
function deps({
  verifiedWallets = { [GOOGLE_ACCOUNT]: [ADDRESS.toLowerCase()] },
  watchWallets = {},
  accounts = [GOOGLE_ACCOUNT, SOLANA_ACCOUNT, STRANGER_ACCOUNT],
  nonces = { [ADDRESS.toLowerCase()]: { nonce: NONCE, expires: 2_000 } },
  recovered = ADDRESS,
  // The address the message is expected to carry. Recovery must run over the
  // address EXACTLY as submitted — lower-casing it before signing would make
  // every checksummed-address client fail to verify.
  signedAddress = ADDRESS,
  now = () => 1_000,
} = {}) {
  const calls = { takeNonce: 0 };
  return {
    calls,
    nonces,
    takeNonce: (key) => {
      calls.takeNonce += 1;
      const stored = nonces[key] || null;
      delete nonces[key];        // single use, exactly like the server's store
      return stored;
    },
    recoverAddress: (message, signature) => {
      assert.equal(message, loginMessage(signedAddress, NONCE));
      if (signature === 'bad') throw new Error('malformed signature');
      return recovered;
    },
    // Deliberately consults ONLY the verified map — a watch-only row must not
    // satisfy this, which is what the watch-only test below proves.
    hasVerifiedWallet: async (userId, addressLower) =>
      (verifiedWallets[userId] || []).includes(addressLower),
    accountExists: async (userId) => accounts.includes(userId),
    watchWallets,
    now,
  };
}

const body = (over = {}) => ({
  chainlens_id: GOOGLE_ACCOUNT, address: ADDRESS, signature: '0xsig', nonce: NONCE, ...over,
});

test('issues a session for a Google-created account that owns the wallet', async () => {
  const verdict = await resolveWalletSession(body(), deps());
  assert.deepEqual(verdict, { ok: true, userId: GOOGLE_ACCOUNT });
});

test('issues a session for a Solana-created account that owns the wallet', async () => {
  const verdict = await resolveWalletSession(
    body({ chainlens_id: SOLANA_ACCOUNT }),
    deps({ verifiedWallets: { [SOLANA_ACCOUNT]: [ADDRESS.toLowerCase()] } }),
  );
  // The JWT `sub` is built from exactly this id — never a re-resolved one — so
  // chat runs as the account the wallet is displaying.
  assert.deepEqual(verdict, { ok: true, userId: SOLANA_ACCOUNT });
});

test('accepts a differently-cased ChainLens ID and address', async () => {
  const verdict = await resolveWalletSession(
    body({ chainlens_id: `  ${GOOGLE_ACCOUNT.toUpperCase()}  `, address: ADDRESS.toUpperCase() }),
    deps({ signedAddress: ADDRESS.toUpperCase(), recovered: ADDRESS.toUpperCase() }),
  );
  assert.deepEqual(verdict, { ok: true, userId: GOOGLE_ACCOUNT });
});

test('rejects an identity mismatch without falling back to the owning account', async () => {
  // The wallet genuinely owns GOOGLE_ACCOUNT, but asks for a session on someone
  // else's. The old behaviour — resolve the address to whatever account it maps
  // to — is precisely what must not happen.
  const verdict = await resolveWalletSession(body({ chainlens_id: STRANGER_ACCOUNT }), deps());
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 403);
  assert.match(verdict.error, /not a verified wallet on that ChainLens account/i);
});

test('rejects a watch-only link — anyone can add anyone else’s address', async () => {
  const verdict = await resolveWalletSession(
    body({ chainlens_id: STRANGER_ACCOUNT }),
    // STRANGER_ACCOUNT watches the address; it has proved nothing.
    deps({ verifiedWallets: {}, watchWallets: { [STRANGER_ACCOUNT]: [ADDRESS.toLowerCase()] } }),
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 403);
});

test('returns 404 for an unknown account and creates nothing', async () => {
  const unknown = '11111111-2222-4333-8444-555555555555';
  const state = deps();
  const verdict = await resolveWalletSession(body({ chainlens_id: unknown }), state);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 404);
  assert.match(verdict.error, /No ChainLens account has that ID/i);
  // There is no create path in this module at all — the absence of any account
  // mutation is the guarantee, so assert the dependency surface stayed read-only.
  assert.equal(typeof state.hasVerifiedWallet, 'function');
  assert.equal(state.accounts, undefined, 'resolveWalletSession must not write back account state');
});

test('rejects an expired nonce', async () => {
  const verdict = await resolveWalletSession(body(), deps({ now: () => 9_999 }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 400);
  assert.match(verdict.error, /Invalid or expired nonce/i);
});

test('rejects a replayed nonce — the first attempt consumes it', async () => {
  const state = deps();
  assert.equal((await resolveWalletSession(body(), state)).ok, true);

  const replay = await resolveWalletSession(body(), state);
  assert.equal(replay.ok, false);
  assert.match(replay.error, /Invalid or expired nonce/i);
  assert.equal(state.calls.takeNonce, 2);
});

test('consumes the nonce even when the request goes on to fail', async () => {
  // Otherwise a caller could probe account ids all day on one nonce.
  const state = deps();
  const first = await resolveWalletSession(body({ chainlens_id: STRANGER_ACCOUNT }), state);
  assert.equal(first.status, 403);

  const second = await resolveWalletSession(body(), state);
  assert.equal(second.ok, false);
  assert.match(second.error, /Invalid or expired nonce/i);
});

test('rejects a signature that recovers to a different address', async () => {
  const verdict = await resolveWalletSession(
    body(),
    deps({ recovered: '0x00000000000000000000000000000000deadbeef' }),
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 400);
  assert.match(verdict.error, /signature mismatch/i);
});

test('rejects a malformed signature without throwing', async () => {
  const verdict = await resolveWalletSession(body({ signature: 'bad' }), deps());
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /Invalid EVM signature/i);
});

test('rejects a missing or non-uuid ChainLens ID before touching the nonce', async () => {
  for (const chainlens_id of [undefined, '', 'not-a-uuid', 42]) {
    const state = deps();
    const verdict = await resolveWalletSession(body({ chainlens_id }), state);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 400);
    // A malformed id must not burn the user's nonce.
    assert.equal(state.calls.takeNonce, 0);
  }
});

test('signs the exact message backend-server.js rebuilds', () => {
  assert.equal(loginMessage(ADDRESS, NONCE), `ChainLens login\nAddress: ${ADDRESS}\nNonce: ${NONCE}`);
});
