/**
 * Quotes in the shape Magic Money's swap service returns, with fee terms built
 * from the SHARED policy (swap-core.js) so they pass the same checks a real
 * fee-bearing quote passes. Mirrors Magic Money's src/main/swap-fixtures.ts.
 */
const core = require('../public/swap-core.js');

const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const EVM_A = '0x01faF6DFc230d755141D84d7cB980dd68f5Efe13';
const SOL_A = '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d';
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

function appFee(provider, chain, sellAmountRaw, over = {}) {
  return {
    policyVersion: core.SWAP_FEE_POLICY_VERSION,
    provider,
    requestedBps: core.APP_FEE_BPS,
    appliedBps: core.APP_FEE_BPS,
    base: 'input',
    chain,
    tokenAddress: NATIVE,
    tokenSymbol: 'ETH',
    tokenDecimals: 18,
    amountRaw: (BigInt(sellAmountRaw) * BigInt(core.APP_FEE_BPS) / 10000n).toString(),
    recipient: core.SWAP_FEE_BENEFICIARIES.evm,
    recipientKind: 'onchain-address',
    collection: 'in-swap',
    providerSharePct: null,
    verification: 'applied-verified',
    evidence: ['fixture: policy-derived'],
    ...over,
  };
}

const calldataWithFeeRecipient = (prefix = '0x1234') =>
  `${prefix}${core.SWAP_FEE_BENEFICIARIES.evm.slice(2).toLowerCase()}0000`;

/** Curated same-chain ETH → USDC on Ethereum, 0x, fee-bearing. */
function ethToUsdc(over = {}) {
  const sell = over.sellAmountRaw || '1000000000000000000';
  return {
    provider: '0x', fromChain: 'ethereum', toChain: 'ethereum',
    fromTokenAddress: NATIVE, toTokenAddress: USDC_ETH, fromTokenSymbol: 'ETH', toTokenSymbol: 'USDC',
    sellAmountRaw: sell, buyAmountRaw: '1000000', minBuyAmountRaw: '990000', minReceivedSource: 'provider',
    estimatedGasRaw: '210000', slippageBps: 100, priceImpactPct: 0, rate: 1,
    expiresAt: Date.now() + 60_000, isCrossChain: false,
    appFee: appFee('0x', 'ethereum', sell),
    txData: { to: '0x3333333333333333333333333333333333333333', data: calldataWithFeeRecipient(), value: sell },
    ...over,
  };
}

module.exports = { core, NATIVE, EVM_A, SOL_A, USDC_ETH, SOL_MINT, appFee, calldataWithFeeRecipient, ethToUsdc };
