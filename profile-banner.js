'use strict';
function validateBanner(value) {
  if (typeof value !== 'string') return { error: 'Banner must be an image URL', status: 400 };
  const url = value.trim();
  if (url.length > 2.8 * 1024 * 1024) return { error: 'Banner is too large', status: 413 };
  if (url && !/^https:\/\/[^\s]+$/i.test(url) && !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(url)) return { error: 'Banner must use HTTPS or a JPG, PNG or WebP image', status: 400 };
  return { value: url || null };
}
module.exports = { validateBanner };
