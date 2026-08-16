const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:10777',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/static-server.js',
    url: 'http://127.0.0.1:10777',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
