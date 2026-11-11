const { defineConfig } = require('../node_modules/@playwright/test');
const path = require('node:path');

// Independent Linux display verification of the same compiled component/tests.
const root = path.resolve(__dirname, '..');
module.exports = defineConfig({
  testDir: path.join(root, 'tests/browser'),
  testMatch: '**/gitlab-vue2.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: path.join(root, 'artifacts/gitlab-vue2-linux-20261111'),
  use: { browserName: 'webkit', headless: false, baseURL: 'http://127.0.0.1:4199', video: 'on', trace: 'on' },
  webServer: {
    command: 'python3 -m http.server 4199 --bind 127.0.0.1',
    cwd: path.join(root, 'artifacts/gitlab-vue2-site'),
    url: 'http://127.0.0.1:4199/tests/browser/fixtures/gitlab-vue2.html',
    reuseExistingServer: false,
  },
});
