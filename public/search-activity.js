(() => {
  const ACTIVITY_INTERVAL_MS = 10 * 60 * 1000;

  const reportSearchActivity = () => {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/search/activity', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      keepalive: true,
    }).catch(() => {
      // Search already shows its own availability message if warm-up fails.
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportSearchActivity, { once: true });
  } else {
    reportSearchActivity();
  }

  window.setInterval(reportSearchActivity, ACTIVITY_INTERVAL_MS);
  document.addEventListener('visibilitychange', reportSearchActivity);
})();
