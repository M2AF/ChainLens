const { test, expect } = require('@playwright/test');

/**
 * /dex-swap end to end, against fake wallets and mocked /api/dex routes.
 *
 * The wallets are injected before the page loads: an EIP-6963 EVM wallet whose
 * behaviour each test scripts (reject, switch accounts, confirm), and a Wallet
 * Standard Solana wallet used as a SEPARATE destination account. Every quote is
 * built with the shared fee policy, so the real checks in swap-core.js run on
 * it in the browser exactly as they would on a live quote.
 */

const EVM_A = '0x01faF6DFc230d755141D84d7cB980dd68f5Efe13';
const EVM_B = '0x2222222222222222222222222222222222222222';
const SOL_A = '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d';
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SPENDER = '0x0000000000001fF3684f28c67538d4D072C22734';
const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';
const POLICY = '2026-09-19.app-100bps-preferred';
const FEE_CALLDATA = `0x1234${EVM_A.slice(2).toLowerCase()}0000`;
const approveData = (spender, amount) =>
  '0x095ea7b3' + spender.slice(2).toLowerCase().padStart(64, '0') + BigInt(amount).toString(16).padStart(64, '0');

const fee = (over) => ({
  policyVersion: POLICY, requestedBps: 100, appliedBps: 100, base: 'input', collection: 'in-swap',
  providerSharePct: null, verification: 'applied-verified', evidence: ['e2e fixture'], ...over,
});

/** Base USDC -> ETH through 0x, with an approval (the route a real quote returns). */
function usdcToEth(params) {
  const sell = params.get('amount');
  return {
    provider: '0x', fromChain: 'base', toChain: 'base', fromTokenAddress: USDC_BASE, toTokenAddress: NATIVE,
    fromTokenSymbol: 'USDC', toTokenSymbol: 'ETH', sellAmountRaw: sell, buyAmountRaw: '2000000000000000',
    minBuyAmountRaw: '1980000000000000', minReceivedSource: 'provider', estimatedGasRaw: '0', slippageBps: Number(params.get('slippageBps')),
    priceImpactPct: 0, rate: 1, expiresAt: Date.now() + 60_000, isCrossChain: false,
    appFee: fee({ provider: '0x', chain: 'base', tokenAddress: USDC_BASE, tokenSymbol: 'USDC', tokenDecimals: 6,
      amountRaw: (BigInt(sell) / 100n).toString(), recipient: EVM_A, recipientKind: 'onchain-address' }),
    txData: { to: SPENDER, data: FEE_CALLDATA, value: '0' },
    approvalTx: { to: USDC_BASE, data: approveData(SPENDER, sell), value: '0' },
  };
}

/** Base ETH -> Solana SOL through LI.FI, paid to the Solana account in the request. */
function ethToSol(params) {
  const sell = params.get('amount');
  return {
    provider: 'lifi', fromChain: 'base', toChain: 'solana', fromTokenAddress: NATIVE, toTokenAddress: SOL_MINT,
    fromTokenSymbol: 'ETH', toTokenSymbol: 'SOL', sellAmountRaw: sell, buyAmountRaw: '20000000', minBuyAmountRaw: '19800000',
    minReceivedSource: 'provider', estimatedGasRaw: '0', slippageBps: Number(params.get('slippageBps')), priceImpactPct: 0, rate: 1,
    expiresAt: Date.now() + 60_000, isCrossChain: true, toAddress: params.get('toAddress'), bridgeTool: 'relaydepository',
    appFee: fee({ provider: 'lifi', chain: 'base', tokenAddress: NATIVE, tokenSymbol: 'ETH', tokenDecimals: 18,
      amountRaw: (BigInt(sell) / 100n).toString(), recipient: 'ChainLens', recipientKind: 'registered-integrator' }),
    txData: { to: LIFI_DIAMOND, data: '0xabcd', value: sell },
  };
}

async function installWallets(page, { evmAccount = EVM_A } = {}) {
  await page.addInitScript(({ account, solAccount }) => {
    const listeners = {};
    const w = window.__evm = {
      account, chainId: 8453, sent: [], receipts: {}, reject: [], afterSend: null, allowance: '0x0',
      emit(event, value) { (listeners[event] || []).forEach(fn => fn(value)); },
    };
    const provider = {
      on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
      removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter(f => f !== fn); },
      async request({ method, params }) {
        switch (method) {
          case 'eth_requestAccounts': case 'eth_accounts': return [w.account];
          case 'eth_chainId': return '0x' + w.chainId.toString(16);
          case 'wallet_switchEthereumChain': w.chainId = parseInt(params[0].chainId, 16); w.emit('chainChanged', params[0].chainId); return null;
          case 'eth_getBalance': return '0x' + (10n ** 21n).toString(16);
          case 'eth_call': {
            const data = params[0].data || '';
            if (data.startsWith('0xdd62ed3e')) return '0x' + BigInt(w.allowance).toString(16).padStart(64, '0');
            if (data.startsWith('0x70a08231')) return '0x' + (10n ** 21n).toString(16).padStart(64, '0');
            return '0x';
          }
          case 'eth_sendTransaction': {
            const behaviour = w.reject.shift();
            if (behaviour) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            const hash = '0x' + String(w.sent.length + 1).padStart(64, 'a');
            w.sent.push(params[0]);
            w.receipts[hash] = { status: '0x1' };
            if (w.afterSend) w.afterSend(w.sent.length, hash);
            return hash;
          }
          case 'eth_getTransactionReceipt': return w.receipts[params[0]] || null;
          default: throw new Error(`fake wallet: ${method}`);
        }
      },
    };
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid: 'test-evm', name: 'Test EVM Wallet', icon: '', rdns: 'test.evm' }, provider },
      }));
    });

    const sol = window.__sol = { sent: [] };
    const wallet = {
      name: 'Test Solana Wallet', icon: 'data:image/png;base64,', version: '1.0.0', chains: ['solana:mainnet'], accounts: [],
      features: {
        'standard:connect': { connect: async () => { wallet.accounts = [{ address: solAccount, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: [] }]; return { accounts: wallet.accounts }; } },
        'standard:events': { on: () => () => {} },
        'solana:signMessage': { signMessage: async () => [] },
        'solana:signAndSendTransaction': { signAndSendTransaction: async (input) => { sol.sent.push(input); return [{ signature: new Uint8Array(64).fill(7) }]; } },
      },
    };
    window.addEventListener('wallet-standard:app-ready', (e) => e.detail.register(wallet));
  }, { account: evmAccount, solAccount: SOL_A });
}

async function mockDex(page, { status } = {}) {
  const seen = { quotes: [], statusCalls: 0 };
  await page.route('**/api/dex/tokens**', route => route.fulfill({ json: { tokens: [], error: null } }));
  await page.route('**/api/dex/quote**', route => {
    const params = new URL(route.request().url()).searchParams;
    seen.quotes.push(Object.fromEntries(params));
    const quote = params.get('toChain') === 'solana' ? ethToSol(params) : usdcToEth(params);
    return route.fulfill({ json: { quote, routing: null, error: null } });
  });
  await page.route('**/api/dex/tx-status**', route => route.fulfill({ json: { state: 'confirmed' } }));
  await page.route('**/api/dex/status**', route => {
    seen.statusCalls += 1;
    return route.fulfill({ json: status ? status(seen.statusCalls) : { providerStatus: 'PENDING' } });
  });
  return seen;
}

async function chooseToken(page, side, address) {
  await page.getByTestId(`${side}-search`).focus();
  await page.getByTestId(`${side}-results`).locator(`button[data-address="${address}"]`).click();
}

async function quoteUsdcToEth(page) {
  await page.getByTestId('from-chain').selectOption('base');
  await chooseToken(page, 'from', USDC_BASE);
  await page.getByTestId('to-chain').selectOption('base');
  await chooseToken(page, 'to', NATIVE);
  await page.getByTestId('amount').fill('5');
  await page.getByTestId('get-quote').click();
  await expect(page.getByTestId('quote')).toBeVisible();
}

const row = (page) => page.getByTestId('swap-row').first();

/** Wallet discovery waits for EIP-6963 / Wallet Standard announcements; wait for the account. */
async function connectEvm(page) {
  await page.getByRole('button', { name: 'Connect EVM wallet' }).click();
  await expect(page.getByTestId('evm-wallet')).toContainText('0x');
}
async function connectSolana(page) {
  await page.getByRole('button', { name: 'Connect Solana wallet' }).click();
  await expect(page.getByTestId('solana-wallet')).toContainText(SOL_A);
}

test.describe('DEX swap page', () => {
  test.setTimeout(60_000);

  test('SimpleSwap stays on Magic Swap, and the DEX page links back to it', async ({ page }) => {
    await installWallets(page);
    await mockDex(page);
    await page.goto('/dex-swap');
    await expect(page.getByRole('link', { name: /Magic Swap \(SimpleSwap exchange\)/ })).toHaveAttribute('href', '/magic-swap');
  });

  test('approval, then swap, then completion tracked from the source receipt', async ({ page }) => {
    await installWallets(page);
    await mockDex(page);
    await page.goto('/dex-swap');
    await connectEvm(page);
    await expect(page.getByTestId('evm-wallet')).toContainText(EVM_A);
    await quoteUsdcToEth(page);
    await expect(page.getByTestId('quote-details')).toContainText('1% Magic Money fee');
    await expect(page.getByTestId('quote-details')).toContainText(SPENDER.toLowerCase());
    await page.getByTestId('swap').click();
    await expect(row(page)).toHaveAttribute('data-state', 'completed', { timeout: 20_000 });
    const sent = await page.evaluate(() => window.__evm.sent);
    expect(sent.map(t => t.to.toLowerCase())).toEqual([USDC_BASE.toLowerCase(), SPENDER.toLowerCase()]);
    expect(sent[0].data.startsWith('0x095ea7b3')).toBe(true);
  });

  test('a rejected approval sends nothing and is recorded as not sent', async ({ page }) => {
    await installWallets(page);
    await mockDex(page);
    await page.goto('/dex-swap');
    await page.evaluate(() => { window.__evm.reject = [true]; });
    await connectEvm(page);
    await quoteUsdcToEth(page);
    await page.getByTestId('swap').click();
    await expect(page.getByTestId('swap-message')).toContainText('The approval was declined in your wallet.');
    await expect(row(page)).toContainText('Not sent');
    expect(await page.evaluate(() => window.__evm.sent.length)).toBe(0);
  });

  test('an account change while the approval confirms stops the swap; the approval is reported', async ({ page }) => {
    await installWallets(page);
    await mockDex(page);
    await page.goto('/dex-swap');
    await page.evaluate((b) => {
      window.__evm.afterSend = (n) => { if (n === 1) { window.__evm.account = b; window.__evm.emit('accountsChanged', [b]); } };
    }, EVM_B);
    await connectEvm(page);
    await quoteUsdcToEth(page);
    await page.getByTestId('swap').click();
    await expect(page.getByTestId('swap-message')).toContainText(/account or network changed/);
    await expect(page.getByTestId('swap-message')).toContainText('The approval');
    await expect(row(page)).toContainText('Not sent');
    await expect(row(page)).toContainText('approval transaction');
    expect(await page.evaluate(() => window.__evm.sent.length)).toBe(1);
  });

  test('an allowance already in place skips the approval', async ({ page }) => {
    await installWallets(page);
    await mockDex(page);
    await page.goto('/dex-swap');
    await page.evaluate(() => { window.__evm.allowance = '0x' + (10n ** 12n).toString(16); });
    await connectEvm(page);
    await quoteUsdcToEth(page);
    await page.getByTestId('swap').click();
    await expect(row(page)).toHaveAttribute('data-state', 'completed', { timeout: 20_000 });
    const sent = await page.evaluate(() => window.__evm.sent);
    expect(sent.map(t => t.to.toLowerCase())).toEqual([SPENDER.toLowerCase()]);
  });

  test('EVM -> Solana pays a separate connected Solana account; a partial delivery is reported as partial', async ({ page }) => {
    await installWallets(page);
    const seen = await mockDex(page, {
      status: () => ({
        providerStatus: 'DONE', providerSubstatus: 'PARTIAL', receivedTokenAddress: USDC_SOL, receivedTokenSymbol: 'USDC',
        receivedTokenDecimals: 6, receivedTokenChain: '1151111081099710', receivedAmountRaw: '1000000', destTxHash: '5xyz',
      }),
    });
    await page.goto('/dex-swap');
    await connectEvm(page);
    await page.getByTestId('to-chain').selectOption('solana');
    await expect(page.getByTestId('recipient')).toContainText('connect a Solana wallet');
    await connectSolana(page);
    await expect(page.getByTestId('recipient')).toContainText(SOL_A);
    await page.getByTestId('from-chain').selectOption('base');
    await chooseToken(page, 'from', NATIVE);
    await chooseToken(page, 'to', SOL_MINT);
    await page.getByTestId('amount').fill('0.001');
    await page.getByTestId('get-quote').click();
    await expect(page.getByTestId('quote-details')).toContainText(SOL_A);
    expect(seen.quotes[0].taker).toBe(EVM_A);
    expect(seen.quotes[0].toAddress).toBe(SOL_A);
    await page.getByTestId('swap').click();
    await expect(row(page)).toHaveAttribute('data-state', 'partial', { timeout: 25_000 });
    await expect(row(page)).toContainText('received USDC instead');
    expect(await page.evaluate(() => window.__sol.sent.length)).toBe(0);
    expect(await page.evaluate(() => window.__evm.sent.length)).toBe(1);
  });

  test('restart: a bridging swap is resumed after a reload and ends refunded', async ({ page }) => {
    await installWallets(page);
    let refunded = false;
    await mockDex(page, {
      status: () => (refunded
        ? { providerStatus: 'DONE', providerSubstatus: 'REFUNDED', receivedTokenAddress: NATIVE, receivedTokenChain: '8453' }
        : { providerStatus: 'PENDING', providerSubstatus: 'WAIT_DESTINATION_TRANSACTION' }),
    });
    await page.goto('/dex-swap');
    await connectEvm(page);
    await page.getByTestId('to-chain').selectOption('solana');
    await connectSolana(page);
    await chooseToken(page, 'from', NATIVE);
    await chooseToken(page, 'to', SOL_MINT);
    await page.getByTestId('amount').fill('0.001');
    await page.getByTestId('get-quote').click();
    await page.getByTestId('swap').click();
    await expect(row(page)).toHaveAttribute('data-state', 'bridging', { timeout: 25_000 });

    refunded = true;
    await page.reload();
    // Nothing is connected after the reload: the record alone drives the resume.
    await expect(page.getByTestId('evm-wallet')).toContainText('not connected');
    await expect(row(page)).toHaveAttribute('data-state', 'refunded', { timeout: 25_000 });
    await expect(row(page)).toContainText('returned on the source chain');
  });
});
