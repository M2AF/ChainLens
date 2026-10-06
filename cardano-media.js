'use strict';
const { urls } = require('./public/nft-image');
function text(value) {
  const string = Array.isArray(value) ? value.filter(v => typeof v === 'string').join('') : typeof value === 'string' ? value : '';
  // Some CIP-68 providers expose CBOR byte/text strings as hex. Decode only a
  // complete, definite-length string; arbitrary long hex is never a CID.
  if (!/^(?:[0-9a-f]{2})+$/i.test(string)) return string;
  const bytes = Buffer.from(string,'hex'), major = bytes[0] >> 5, extra = bytes[0] & 31;
  if (![2,3].includes(major)) return string;
  let prefix=1,size=extra;
  if (extra === 24 && bytes.length >= 2) { prefix=2; size=bytes[1]; }
  else if (extra === 25 && bytes.length >= 3) { prefix=3; size=bytes.readUInt16BE(1); }
  else if (extra >= 24) return string;
  if (size !== bytes.length-prefix) return string;
  const body=bytes.subarray(prefix), decoded=body.toString('utf8');
  return Buffer.from(decoded).equals(body) && /^[\x20-\x7e]+$/.test(decoded) ? decoded : string;
}
function cardanoMedia(meta, fungible = false) {
  const metadata = meta.onchain_metadata || {};
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const values = [metadata.image, metadata.image_url, ...files.filter(f => /^image\//i.test(text(f?.mediaType || f?.mimeType))).map(f => f.src)];
  if (fungible) {
    values.push(metadata.logo, metadata.icon);
    const logo = text(meta.metadata?.logo);
    // CIP-26 logos are base64 PNGs, not CIDs or website URLs.
    if (/^iVBORw0KGgo[A-Za-z0-9+/=\s]+$/.test(logo)) values.push('data:image/png;base64,' + logo.replace(/\s/g, ''));
    else values.push(logo);
  }
  const imageSources = [...new Set(values.flatMap(value => urls(text(value))))];
  return { image: imageSources[0] || '', imageSources, media: { provider: 'blockfrost', standard: meta.onchain_metadata_standard || null, status: imageSources.length ? 'candidates' : 'missing-metadata' } };
}
function isCardanoNFT(meta) {
  // Classify using global supply/metadata, never the quantity this wallet holds.
  const standard = String(meta.onchain_metadata_standard || '');
  const label = String(meta.asset_name || '').slice(0, 8).toLowerCase();
  if (label === '000643b0') return false; // CIP-68 reference NFT is not the user asset.
  if (label === '0014df10' || label === '001bc280') return false; // Labels 333/444 are fungible/semi-fungible.
  if (/cip68/i.test(standard) && label !== '000de140' && (Number(meta.metadata?.decimals || meta.onchain_metadata?.decimals) > 0 || meta.metadata?.ticker || meta.onchain_metadata?.ticker)) return false;
  return /cip25/i.test(standard) || label === '000de140' || String(meta.quantity) === '1';
}
module.exports = { cardanoMedia, isCardanoNFT };
