const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  outputDir: `${process.env.SITE_EVIDENCE_DIR || 'test-results'}/browser-artifacts`,
  timeout: 20000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: `${process.env.SITE_EVIDENCE_DIR || 'test-results'}/browser-results.json` },
    ],
  ],
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'root', use: { baseURL: 'http://127.0.0.1:4174/' } },
    { name: 'subpath', use: { baseURL: 'http://127.0.0.1:4175/product-web/' } },
  ],
  webServer: [
    {
      command: 'PORT=4174 node scripts/serve.cjs',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
    },
    {
      command: 'PORT=4175 SITE_BASE_PATH=/product-web node scripts/serve.cjs',
      url: 'http://127.0.0.1:4175/product-web/',
      reuseExistingServer: false,
    },
  ],
});
