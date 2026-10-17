(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const request = Object.fromEntries(['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method'].map(key => [key, params.get(key)]));
  const provider = params.get('login_provider');
  if (['google', 'discord'].includes(provider)) {
    $('signin').href = '/auth/' + provider;
    $('signin').textContent = 'Sign in or create an account with ' + (provider === 'google' ? 'Google' : 'Discord') + ' ↗';
  }
  let token = null;
  async function check() {
    try {
      token = localStorage.getItem('cl_token');
      if (!token) throw new Error('Please sign in to ChainLens first.');
      const response = await fetch('/api/profile', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (!response.ok) throw new Error('Please sign in to ChainLens first.');
      const profile = await response.json();
      $('identity').textContent = profile.display_name || profile.username || 'ChainLens account';
      $('continue').disabled = false;
      $('signin').hidden = true;
      $('status').textContent = 'Continue to share this account’s ID and display name with DUO.';
    } catch {
      token = null;
      $('identity').textContent = 'Sign in to ChainLens to connect your account.';
      $('continue').disabled = true;
      $('signin').hidden = false;
    }
  }
  $('continue').onclick = async () => {
    $('continue').disabled = true;
    try {
      const response = await fetch('/api/duo/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(request) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not connect DUO.');
      const target = new URL(result.redirect);
      // The backend validates the registered callback; the page enforces the same request.
      const requested = new URL(request.redirect_uri);
      if (target.origin !== requested.origin || target.pathname !== requested.pathname) throw new Error('Invalid callback.');
      location.href = target.toString();
    } catch (e) { $('status').textContent = e.message; $('continue').disabled = !token; }
  };
  window.addEventListener('storage', e => { if (e.key === 'cl_token') check(); });
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  check();
})();
