'use strict';
function validateBanner(value) {
  if (typeof value !== 'string') return { error: 'Banner must be an image URL', status: 400 };
  const url = value.trim();
  if (url.length > 2.8 * 1024 * 1024) return { error: 'Banner is too large', status: 413 };
  if (url && !/^https:\/\/[^\s]+$/i.test(url) && !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(url)) return { error: 'Banner must use HTTPS or a JPG, PNG or WebP image', status: 400 };
  return { value: url || null };
}
function profileUpdateError(error, updates) {
  if (Object.hasOwn(updates, 'banner_url') && ['42703', 'PGRST204'].includes(error?.code) && /banner_url/i.test(error.message || '')) {
    return { status: 503, error: 'Banner uploads are not configured yet. Please contact support.', code: 'BANNER_SCHEMA_MISSING' };
  }
  return { status: 500, error: 'Failed to update profile' };
}
module.exports = { validateBanner, profileUpdateError };
