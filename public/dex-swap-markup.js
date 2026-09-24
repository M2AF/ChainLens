// Magic Swap connected-wallet form. Keep data-testid and data-action hooks in sync with dex-swap.js.
window.ChainLensDexSwapMarkup = `
<section class="panel" aria-labelledby="wallets-h">
      <label id="wallets-h">Wallets</label>
      <div class="row">
        <div class="grow wallet" data-testid="evm-wallet">EVM: <strong>not connected</strong></div>
        <button type="button" data-action="connect-evm">Connect EVM wallet</button>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="grow wallet" data-testid="solana-wallet">Solana: <strong>not connected</strong></div>
        <button type="button" data-action="connect-solana">Connect Solana wallet</button>
      </div>
      <div class="results hidden" data-testid="provider-picker" role="listbox" aria-label="Choose a wallet"></div>
    </section>

    <section class="panel" aria-label="Swap">
      <div class="row">
        <div class="grow">
          <label for="from-chain">From</label>
          <select id="from-chain" data-testid="from-chain"></select>
        </div>
        <div class="grow">
          <label for="from-search">Token</label>
          <input id="from-search" data-testid="from-search" placeholder="Name, symbol or address" autocomplete="off">
        </div>
      </div>
      <div class="results hidden" data-testid="from-results" role="listbox" aria-label="Tokens to sell"></div>
      <div class="token" data-testid="from-token"></div>
      <div style="margin-top:12px">
        <label for="amount">Amount</label>
        <input id="amount" data-testid="amount" inputmode="decimal" placeholder="0.0" autocomplete="off">
      </div>

      <div class="flip-row">
        <button type="button" class="flip" data-action="flip" data-testid="flip" aria-label="Switch the tokens you pay and receive" title="Switch">⇅</button>
      </div>

      <div class="row">
        <div class="grow">
          <label for="to-chain">To</label>
          <select id="to-chain" data-testid="to-chain"></select>
        </div>
        <div class="grow">
          <label for="to-search">Token</label>
          <input id="to-search" data-testid="to-search" placeholder="Name, symbol or address" autocomplete="off">
        </div>
      </div>
      <div class="results hidden" data-testid="to-results" role="listbox" aria-label="Tokens to buy"></div>
      <div class="token" data-testid="to-token"></div>

      <div class="row" style="margin-top:12px">
        <div class="grow wallet" data-testid="recipient">Receives at: <strong>—</strong></div>
        <div style="width:130px">
          <label for="slippage">Slippage</label>
          <select id="slippage" data-testid="slippage">
            <option value="50">0.5%</option>
            <option value="100" selected>1%</option>
            <option value="200">2%</option>
            <option value="300">3%</option>
          </select>
        </div>
      </div>
      <div style="margin-top:14px">
        <button type="button" data-action="quote" data-testid="get-quote">Get quote</button>
      </div>
      <div class="msg hidden" data-testid="form-message" role="status"></div>
    </section>

    <section class="panel hidden" data-testid="quote" aria-label="Quote">
      <dl data-testid="quote-details"></dl>
      <p class="note" data-testid="quote-note"></p>
      <div style="margin-top:14px">
        <button type="button" class="primary" data-action="swap" data-testid="swap">Swap</button>
      </div>
      <div class="msg hidden" data-testid="swap-message" role="alert"></div>
    </section>

    <section class="panel" aria-labelledby="history-h">
      <label id="history-h">Your swaps on this device</label>
      <div data-testid="swaps"><p class="note">No swaps yet.</p></div>
    </section>
`;
