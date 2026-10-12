/* Read-only cosmetic holder access and presentation. No signing or transactions. */
(function () {
  'use strict';
  const root = document.documentElement;
  const contract = '0x0351566C7e98780A591c08000576a01801241B31';
  let owners = [], generation = 0, controller = null, pending = null;
  let state = { status:'locked', checkedAt:0 };
  const allowed = () => state.status === 'owned' && Date.now() - state.checkedAt < 90000;
  const publish = (status, checkedAt = 0) => {
    state = { status, checkedAt };
    if (!allowed() && root.getAttribute('data-cl-art-theme') === 'sovereign') window.chainlensThemes.applyTheme(window.chainlensThemes.builtinById('moonlight').colors);
    window.dispatchEvent(new CustomEvent('cl-sovereign-change'));
  };
  async function refresh() {
    if (pending || !owners.length) return pending;
    const ticket = ++generation, list = owners.slice();
    controller = new AbortController(); const signal = controller.signal;
    const timeout = setTimeout(() => {
      if (ticket === generation) { ++generation; controller.abort(); pending = null; publish('error'); }
    }, 10000);
    publish(allowed() ? 'owned' : 'checking', state.checkedAt);
    pending = (async () => {
      try {
        let id = 0;
        const rpc = async (method, params) => {
          const callId = ++id;
          const res = await fetch('https://rpc.mainnet.chain.robinhood.com', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:callId,method,params}), signal, cache:'no-store' });
          const data = res.ok ? await res.json() : null;
          if (!data || data.error || data.id !== callId || data.jsonrpc !== '2.0' || typeof data.result !== 'string') throw Error('RPC unavailable');
          return data.result;
        };
        const chain = await rpc('eth_chainId', []);
        if (!/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== 4663n) throw Error('Wrong chain');
        const block = await rpc('eth_blockNumber', []);
        if (!/^0x[0-9a-f]+$/i.test(block)) throw Error('Invalid block');
        let owns = false;
        for (const owner of list) {
          const word = await rpc('eth_call', [{to:contract,data:'0x70a08231'+owner.slice(2).padStart(64,'0')},block]);
          if (!/^0x[0-9a-f]{64}$/i.test(word)) throw Error('Invalid balance');
          if (BigInt(word) > 0n) { owns = true; break; }
        }
        if (ticket === generation) publish(owns ? 'owned' : 'locked', Date.now());
      } catch { if (ticket === generation) publish('error'); }
      finally { clearTimeout(timeout); if (ticket === generation) pending = null; }
    })();
    return pending;
  }
  const bind = wallets => {
    const next = [...new Set((wallets || []).filter(w => w.chain === 'evm' && w.watch_only === false && /^0x[0-9a-f]{40}$/i.test(w.address)).map(w => w.address.toLowerCase()))].sort();
    ++generation; controller?.abort(); pending = null; owners = next;
    publish(next.length ? 'checking' : 'locked');
    if (next.length) void refresh();
  };
  window.chainlensSovereign = { allowed, refresh, bind, get:() => state };
  const recheck = () => {
    if (document.hidden || localStorage.getItem('cl_theme') !== 'sovereign') return;
    if (!allowed()) publish(state.status);
    void refresh();
  };
  setInterval(recheck, 60000);
  window.addEventListener('focus', recheck);
  document.addEventListener('visibilitychange', recheck);

  // One inert scene; pointer work is coalesced into one animation frame.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scene = null, frame = 0, point = null, lit = null, listening = false;
  const ripples = new Set();
  const selected = () => root.getAttribute('data-cl-art-theme') === 'sovereign';
  const running = () => selected() && !reduced.matches && !document.hidden;
  const clear = () => {
    cancelAnimationFrame(frame); frame = 0;
    lit?.style.removeProperty('--sv-x'); lit?.style.removeProperty('--sv-y'); lit = null;
    root.style.removeProperty('--sv-pointer-x'); root.style.removeProperty('--sv-pointer-y');
    for (const ripple of ripples) ripple.remove(); ripples.clear();
  };
  const move = event => {
    point = event;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0; if (!running()) return;
      root.style.setProperty('--sv-pointer-x', point.clientX+'px'); root.style.setProperty('--sv-pointer-y', point.clientY+'px');
      const surface = point.target.closest?.('.cl-art-panel,.glass-card,.cl-search-hero,.cl-sidebar,.dex-swap .panel,.swap-asset-card');
      if (lit !== surface) { lit?.style.removeProperty('--sv-x'); lit?.style.removeProperty('--sv-y'); }
      lit = surface;
      if (surface) {
        const r = surface.getBoundingClientRect();
        surface.style.setProperty('--sv-x', Math.max(0,Math.min(100,(point.clientX-r.left)/r.width*100))+'%');
        surface.style.setProperty('--sv-y', Math.max(0,Math.min(100,(point.clientY-r.top)/r.height*100))+'%');
      }
    });
  };
  const press = event => {
    if (!running() || event.button !== 0) return;
    move(event);
    const button = event.target.closest?.('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    if (ripples.size >= 6) { const old = ripples.values().next().value; old.remove(); ripples.delete(old); }
    const ring = document.createElement('span'); ring.className = 'sv-ripple'; ring.setAttribute('aria-hidden','true');
    ring.style.left = event.clientX+'px'; ring.style.top = event.clientY+'px'; document.body.append(ring); ripples.add(ring);
    ring.addEventListener('animationend', () => { ring.remove(); ripples.delete(ring); }, {once:true});
  };
  const update = () => {
    if (selected() && !scene && document.body) {
      scene = document.createElement('div'); scene.className = 'sv-scene'; scene.inert = true; scene.setAttribute('aria-hidden','true');
      scene.innerHTML = '<div class="sv-aura"></div><img class="sv-orbit" src="/themes/sovereign/orbit.svg" alt=""><div class="sv-light"></div>';
      document.body.prepend(scene);
    }
    if (!selected()) { scene?.remove(); scene = null; delete root.dataset.svMotion; }
    else root.dataset.svMotion = running() ? 'running' : 'paused';
    if (running() !== listening) {
      listening = running();
      if (listening) { document.addEventListener('pointermove',move,{passive:true}); document.addEventListener('pointerdown',press,{passive:true}); }
      else { document.removeEventListener('pointermove',move); document.removeEventListener('pointerdown',press); clear(); }
    }
  };
  new MutationObserver(update).observe(root,{attributes:true,attributeFilter:['data-cl-art-theme']});
  reduced.addEventListener('change',update); document.addEventListener('visibilitychange',update); document.addEventListener('DOMContentLoaded',update,{once:true});
})();
