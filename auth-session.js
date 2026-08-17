'use strict';

/**
 * auth-session.js — the decision behind POST /api/auth/wallet-session.
 *
 * Extracted from the route so it can be tested without a server or a database:
 * every dependency (the nonce store, signature recovery, the two lookups) is
 * injected, and the function returns a verdict rather than writing a response.
 *
 * The rule it enforces, in one sentence: a session is issued ONLY for the
 * ChainLens account the caller named, and only when the signing address is a
 * proved wallet of that exact account. It never creates, links, merges, or
 * falls back to a "closest match" — those are the behaviours that let chat run
 * as a different identity than the wallet displays.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The exact string the wallet signs. Mirrored in backend-server.js. */
const loginMessage = (address, nonce) => `ChainLens login\nAddress: ${address}\nNonce: ${nonce}`;

const deny = (status, error, extra = {}) => ({ ok: false, status, error, ...extra });

/**
 * @param {object} body     `{ chainlens_id, address, signature, nonce }` as received.
 * @param {object} deps
 * @param {(addressKey: string) => {nonce: string, expires: number}|null} deps.takeNonce
 *        Reads AND CONSUMES the stored nonce for an address. Consuming inside
 *        the lookup is what makes a replay fail on the second attempt no matter
 *        which branch the first attempt took.
 * @param {(message: string, signature: string) => string} deps.recoverAddress
 *        EIP-191 recovery. Throws on a malformed signature.
 * @param {(userId: string, addressLower: string) => Promise<boolean>} deps.hasVerifiedWallet
 *        Is this a non-watch-only evm wallet of THAT account?
 * @param {(userId: string) => Promise<boolean>} deps.accountExists
 * @param {() => number} [deps.now]
 */
async function resolveWalletSession(body, deps) {
  const { chainlens_id: rawId, address, signature, nonce } = body || {};
  const now = deps.now ? deps.now() : Date.now();

  if (typeof address !== 'string' || typeof signature !== 'string' || typeof nonce !== 'string') {
    return deny(400, 'address, signature, nonce required');
  }
  const userId = typeof rawId === 'string' ? rawId.trim().toLowerCase() : '';
  if (!UUID_RE.test(userId)) return deny(400, 'Enter a valid ChainLens ID');

  // Consume first. A caller who gets past this line has spent the nonce, so the
  // same body replayed a second time cannot reach the lookups below.
  const addressKey = address.toLowerCase();
  const stored = deps.takeNonce(addressKey);
  if (!stored || stored.nonce !== nonce || stored.expires < now) {
    return deny(400, 'Invalid or expired nonce');
  }

  let recovered;
  try {
    recovered = deps.recoverAddress(loginMessage(address, nonce), signature);
  } catch {
    return deny(400, 'Invalid EVM signature');
  }
  if (String(recovered).toLowerCase() !== addressKey) return deny(400, 'EVM signature mismatch');

  // watch_only=false is the load-bearing filter. Anyone may add anyone else's
  // address to their own profile as a watch wallet; honouring such a row would
  // hand out a session for an account the signer does not own.
  if (await deps.hasVerifiedWallet(userId, addressKey)) return { ok: true, userId };

  // Both outcomes are fixed the same way — from Profile — so the split exists
  // only to word the message usefully.
  if (await deps.accountExists(userId)) {
    return deny(403, 'This wallet is not a verified wallet on that ChainLens account. Open Profile and sync.', { chainlens_id: userId });
  }
  return deny(404, 'No ChainLens account has that ID. Open Profile and connect first.', { chainlens_id: userId });
}

module.exports = { resolveWalletSession, loginMessage, UUID_RE };
