import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, devices, firefox } from '@playwright/test';

function patchWindowsFirefoxSxsManifest() {
  if (process.platform !== 'win32') return;

  const executablePath = firefox.executablePath();
  if (!existsSync(executablePath)) return;

  const executable = readFileSync(executablePath);
  const manifestText = executable.toString('latin1');
  const mozglueDependency =
    /<dependency>\s*<dependentAssembly>\s*<assemblyIdentity\s+(?=[^>]*\bname="mozglue")[^>]*\/>\s*<\/dependentAssembly>\s*<\/dependency>/g;
  const matches = [...manifestText.matchAll(mozglueDependency)];

  // Windows 11 build 26200 rejects Playwright Firefox's embedded mozglue
  // private-assembly manifest. Removing only that SxS declaration lets the
  // normal loader use the mozglue.dll shipped beside firefox.exe.
  if (matches.length === 0) return;
  if (matches.length !== 1 || matches[0].index === undefined) {
    throw new Error(`Expected one mozglue SxS dependency in ${executablePath}, found ${matches.length}`);
  }

  const start = matches[0].index;
  const end = start + matches[0][0].length;
  const patched = Buffer.from(executable);
  patched.fill(0x20, start, end);

  const backupPath = `${executablePath}.sxs-original`;
  if (!existsSync(backupPath)) copyFileSync(executablePath, backupPath);
  writeFileSync(executablePath, patched);
}

patchWindowsFirefoxSxsManifest();

const port = 4173;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm build && pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/browser-tests.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', testMatch: '**/editor.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: '**/editor.spec.ts', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: '**/editor.spec.ts', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', testMatch: '**/mobile.spec.ts', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', testMatch: '**/mobile.spec.ts', use: { ...devices['iPhone 15'] } },
  ],
});
