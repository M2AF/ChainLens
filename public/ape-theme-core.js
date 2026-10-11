var ChainLensApeAccess = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/shared/ape-theme-entry.ts
  var ape_theme_entry_exports = {};
  __export(ape_theme_entry_exports, {
    APE_CONTRACT: () => APE_CONTRACT,
    APE_RPC: () => APE_RPC,
    apeImageUrls: () => apeImageUrls,
    createApeAccess: () => createApeAccess,
    decodeApeUri: () => decodeApeUri,
    readOwnedApes: () => readOwnedApes
  });

  // src/shared/ape-theme-core.ts
  var APE_CONTRACT = "0xF08Acc2f16Ddf2f5d047fcc4D39A6c528A9645af";
  var APE_RPC = "https://ethereum-rpc.publicnode.com";
  var address = (value) => /^0x[0-9a-f]{40}$/i.test(value);
  var word = (value) => value.toString(16).padStart(64, "0");
  function uint(value) {
    if (!/^0x[0-9a-f]{64}$/i.test(value)) throw Error("Invalid ABI integer");
    return BigInt(value);
  }
  function decodeApeUri(value) {
    if (!/^0x(?:[0-9a-f]{2}){64,131072}$/i.test(value)) throw Error("Invalid ABI string");
    const bytes = Uint8Array.from(value.slice(2).match(/../g), (byte) => parseInt(byte, 16));
    const offset = Number(uint("0x" + value.slice(2, 66)));
    if (offset !== 32) throw Error("Invalid ABI offset");
    const length = Number(uint("0x" + value.slice(66, 130)));
    if (!Number.isSafeInteger(length) || length > 65536 || offset + 32 + length > bytes.length) throw Error("Invalid ABI length");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(offset + 32, offset + 32 + length));
  }
  function apeImageUrls(uri) {
    if (typeof uri !== "string" || uri.length > 4096) return [];
    const path = uri.replace(/^ipfs:\/\/(?:ipfs\/)?/i, "");
    if (/^ipfs:\/\//i.test(uri) && /^[a-z0-9]+(?:\/[^?#\s]*)?$/i.test(path) && !path.includes("..")) {
      return ["https://gateway.pinata.cloud/ipfs/", "https://dweb.link/ipfs/", "https://ipfs.io/ipfs/"].map((base) => base + path);
    }
    try {
      const url = new URL(uri);
      return url.protocol === "https:" && !url.username && !url.password ? [url.href] : [];
    } catch {
      return [];
    }
  }
  async function readOwnedApes(owners, signal, request = fetch) {
    const list = [...new Set(owners.map((owner) => owner.toLowerCase()))];
    if (!list.length || list.some((owner) => !address(owner))) throw Error("Invalid owner");
    let id = 0;
    const rpc = async (method, params) => {
      const callId = ++id;
      const res = await request(APE_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: callId, method, params }), signal, cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      if (!data || data.error || data.jsonrpc !== "2.0" || data.id !== callId || typeof data.result !== "string") throw Error("Ownership RPC unavailable");
      return data.result;
    };
    const chain = await rpc("eth_chainId", []);
    if (!/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== 1n) throw Error("Wrong chain");
    const block = await rpc("eth_blockNumber", []);
    if (!/^0x[0-9a-f]+$/i.test(block)) throw Error("Invalid block");
    const checkedAt = Date.now();
    const call = (data) => rpc("eth_call", [{ to: APE_CONTRACT, data }, block]);
    const apes = [];
    let complete = true;
    for (const owner of list) {
      const balance = uint(await call("0x70a08231" + owner.slice(2).padStart(64, "0")));
      if (balance === 0n) continue;
      if (balance > 7000n) throw Error("Invalid collection balance");
      let params = { holder_address_hash: owner };
      const candidates = /* @__PURE__ */ new Set(), cursors = /* @__PURE__ */ new Set();
      for (let page = 0; page < 150; page++) {
        const url = `https://eth.blockscout.com/api/v2/tokens/${APE_CONTRACT}/instances?${new URLSearchParams(params)}`;
        const res = await request(url, { signal, cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (!data || !Array.isArray(data.items)) throw Error("Ape discovery unavailable");
        for (const item of data.items) {
          if (/^\d{1,78}$/.test(String(item.id)) && BigInt(item.id) < 2n ** 256n) candidates.add(BigInt(item.id).toString());
        }
        if (!data.next_page_params) break;
        const next = { holder_address_hash: owner };
        for (const [key, value] of Object.entries(data.next_page_params)) if (typeof value === "string" || typeof value === "number") next[key] = String(value);
        next.holder_address_hash = owner;
        const cursor = JSON.stringify(next);
        if (cursors.has(cursor)) throw Error("Invalid discovery cursor");
        cursors.add(cursor);
        params = next;
        if (page === 149) throw Error("Discovery exceeds collection bounds");
      }
      let verified = 0n;
      for (const tokenId of candidates) {
        const ownedBy = await call("0x6352211e" + word(BigInt(tokenId)));
        uint(ownedBy);
        if (ownedBy.slice(2, 26) !== "0".repeat(24)) throw Error("Invalid ABI owner");
        if ("0x" + ownedBy.slice(-40).toLowerCase() !== owner) continue;
        verified++;
        const uri = decodeApeUri(await call("0xc87b56dd" + word(BigInt(tokenId))));
        let metadata;
        if (uri.startsWith("data:application/json;base64,")) {
          const raw = atob(uri.slice(29));
          if (raw.length > 65536) throw Error("Metadata exceeds bounds");
          metadata = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
        } else {
          const locations = apeImageUrls(uri);
          if (!locations.length) throw Error("Unsupported metadata URI");
          const res = await request(locations[0], { signal, cache: "no-store" });
          if (!res.ok) throw Error("Metadata unavailable");
          const text = await res.text();
          if (text.length > 65536) throw Error("Metadata exceeds bounds");
          metadata = JSON.parse(text);
        }
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw Error("Invalid metadata");
        apes.push({ id: tokenId, owner, name: typeof metadata.name === "string" ? metadata.name.slice(0, 100) : `Ape #${tokenId}`, images: apeImageUrls(metadata.image) });
      }
      if (verified !== balance) complete = false;
      if (balance > 0n && verified === 0n) throw Error("Owned apes not indexed yet");
    }
    return { apes, checkedAt, complete };
  }

  // src/shared/ape-theme-access.ts
  function createApeAccess(options) {
    let owners = [], generation = 0, pending = null, controller = null;
    let state = { status: "locked", apes: [], selected: null, image: null, checkedAt: 0, complete: true };
    const allowed = () => state.status === "owned" && !!state.selected && !!state.image && state.apes.some((a) => a.owner === state.selected?.owner && a.id === state.selected?.id) && Date.now() - state.checkedAt < 9e4;
    const publish = (next) => {
      state = next;
      options.changed();
    };
    const key = (owner) => options.prefix + "." + owner;
    const preferred = () => {
      for (const owner of owners) {
        const id = localStorage.getItem(key(owner));
        const ape = state.apes.find((a) => a.owner === owner && a.id === id);
        if (ape) return ape;
      }
      return state.apes[0] || null;
    };
    async function artwork(ape, signal) {
      for (const url of ape.images) {
        try {
          await new Promise((resolve, reject) => {
            const img = new Image(), timer2 = setTimeout(() => finish(Error("Image timed out")), 8e3);
            const abort = () => finish(Error("Aborted"));
            const finish = (error) => {
              clearTimeout(timer2);
              signal.removeEventListener("abort", abort);
              img.onload = null;
              img.onerror = null;
              if (error) {
                img.src = "";
                reject(error);
              } else resolve();
            };
            img.onload = () => img.naturalWidth > 0 ? finish() : finish(Error("Invalid image"));
            img.onerror = () => finish(Error("Image unavailable"));
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
            else img.src = url;
          });
          return url;
        } catch {
          if (signal.aborted) throw Error("Aborted");
        }
      }
      throw Error("Ape artwork unavailable");
    }
    async function refresh() {
      if (pending) return pending;
      if (!owners.length) return;
      const ticket = ++generation, expected = owners.slice(), abort = new AbortController();
      controller = abort;
      const timer2 = setTimeout(() => {
        if (ticket === generation) {
          ++generation;
          abort.abort();
          pending = null;
          publish({ ...state, status: "error", image: null, checkedAt: 0 });
        }
      }, 45e3);
      publish({ ...state, status: allowed() ? "owned" : "checking" });
      pending = (async () => {
        try {
          const result = await readOwnedApes(expected, abort.signal);
          if (ticket !== generation) return;
          if (options.currentOwners) {
            const current = (await options.currentOwners()).map((a) => a.toLowerCase()).sort();
            if (JSON.stringify(current) !== JSON.stringify(expected)) {
              bind(current);
              return;
            }
          }
          publish({ ...state, apes: result.apes, checkedAt: result.checkedAt, complete: result.complete });
          const selected = preferred();
          const image = selected ? await artwork(selected, abort.signal) : null;
          if (ticket !== generation) return;
          publish({ ...state, status: selected ? "owned" : "locked", selected, image });
        } catch {
          if (ticket === generation) publish({ ...state, status: "error", image: null, checkedAt: 0 });
        } finally {
          clearTimeout(timer2);
          if (ticket === generation) pending = null;
        }
      })();
      return pending;
    }
    function bind(next) {
      const normalized = [...new Set(next.map((a) => a.toLowerCase()))].sort();
      ++generation;
      controller?.abort();
      pending = null;
      owners = normalized;
      publish({ status: normalized.length ? "checking" : "locked", apes: [], selected: null, image: null, checkedAt: 0, complete: true });
      if (normalized.length) void refresh();
    }
    async function select(owner, id) {
      const ape = state.apes.find((a) => a.owner === owner && a.id === id);
      if (!ape || !owners.includes(owner)) return;
      localStorage.setItem(key(owner), id);
      controller?.abort();
      ++generation;
      pending = null;
      await refresh();
    }
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (state.status === "owned" && !allowed()) options.changed();
      if (owners.length && document.documentElement.getAttribute("data-theme") === "ape-society" || owners.length && document.documentElement.getAttribute("data-cl-art-theme") === "ape-society") void refresh();
    }, 3e4);
    const focus = () => {
      if (!document.hidden && owners.length) {
        if (!allowed()) options.changed();
        void refresh();
      }
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return { get: () => state, allowed, bind, refresh, select, dispose: () => {
      ++generation;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    } };
  }
  return __toCommonJS(ape_theme_entry_exports);
})();
