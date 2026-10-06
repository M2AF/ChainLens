'use strict';
const https = require('node:https');
const dns = require('node:dns/promises');
const net = require('node:net');
const { urls } = require('./public/nft-image');
const MAX_BYTES = 1024 * 1024;
function publicAddress(address) {
  if (net.isIP(address) !== 4) return false; // Fail closed; IPv4-pinned HTTPS is sufficient here.
  const [a,b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
}
function embedded(uri) {
  if (!/^data:application\/json(?:;charset=[^;,]+)?(?:;base64)?,/i.test(uri)) return null;
  if (uri.length > MAX_BYTES * 2) throw Error('Metadata too large');
  const comma = uri.indexOf(',');
  const body = /;base64$/i.test(uri.slice(0,comma)) ? Buffer.from(uri.slice(comma+1),'base64').toString('utf8') : decodeURIComponent(uri.slice(comma+1));
  if (Buffer.byteLength(body) > MAX_BYTES) throw Error('Metadata too large');
  return JSON.parse(body);
}
function createDocumentReader({fetchImpl,lookup = dns.lookup}) {
  return async uri => {
    const inline = embedded(uri);
    if (inline) return inline;
    let url = urls(uri)[0];
    const signal = AbortSignal.timeout(5000);
    for (let redirects = 0; redirects < 4; redirects++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || target.username || target.password || target.port) throw Error('Unsupported metadata URL');
      if (net.isIP(target.hostname) && !publicAddress(target.hostname) || target.hostname.startsWith('[')) throw Error('Private metadata destination');
      let agent;
      // Fixed public gateways are existing trusted destinations. Custom token hosts
      // require public DNS and a pinned connection to prevent DNS rebinding.
      if (!['arweave.net','ipfs.blockfrost.dev','gateway.pinata.cloud','ipfs.filebase.io'].some(host => target.hostname === host || target.hostname.endsWith('.'+host))) {
        const answers = await Promise.race([lookup(target.hostname,{all:true,family:4}), new Promise((_,reject) => {
          if (signal.aborted) reject(Error('Metadata timeout'));
          else signal.addEventListener('abort',() => reject(Error('Metadata timeout')),{once:true});
        })]);
        if (!answers.length || answers.some(answer => !publicAddress(answer.address))) throw Error('Private metadata destination');
        const answer = answers[0];
        agent = new https.Agent({lookup:(_host,options,callback) => callback(null,options.all ? [answer] : answer.address,answer.family)});
      }
      try {
        const response = await fetchImpl(url,{signal,redirect:'manual',agent,size:MAX_BYTES});
        if ([301,302,303,307,308].includes(response.status)) {
          const next = response.headers?.get('location');
          response.body?.destroy?.();
          if (!next) throw Error('Missing redirect');
          url = new URL(next,url).href; continue;
        }
        if (!response.ok || Number(response.headers?.get('content-length') || 0) > MAX_BYTES) throw Error('Metadata unavailable or too large');
        let body;
        if (response.body?.[Symbol.asyncIterator]) {
          const chunks=[]; let size=0;
          for await (const chunk of response.body) {
            const bytes = Buffer.from(chunk); size += bytes.length;
            if (size > MAX_BYTES) { response.body.destroy?.(); throw Error('Metadata too large'); }
            chunks.push(bytes);
          }
          body = Buffer.concat(chunks).toString('utf8');
        } else body = await response.text();
        if (Buffer.byteLength(body) > MAX_BYTES) throw Error('Metadata too large');
        const metadata = JSON.parse(body);
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw Error('Invalid NFT metadata');
        return metadata;
      } finally { agent?.destroy(); }
    }
    throw Error('Too many metadata redirects');
  };
}
module.exports = {createDocumentReader,publicAddress,embedded};
