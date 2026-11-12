import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux')
  throw new Error('Run inside Linux with the isolated native Docker engine.');
const root = fileURLToPath(new URL('../', import.meta.url));
const install = JSON.parse(
  await readFile(resolve(root, 'artifacts/gitlab-native-browser-install/install.json')),
);
const compose = [
  'compose',
  '-f',
  resolve(root, 'integrations/gitlab/runtime/compose.yaml'),
  '-f',
  resolve(root, 'integrations/gitlab/runtime/compose.frontend.yaml'),
];
const env = {
  ...process.env,
  FOUNTAIN_GITLAB_FRONTEND_ASSETS: resolve(install.source, 'public/assets/webpack'),
};
try {
  execFileSync('docker', [...compose, 'up', '-d', 'baseline'], {
    env,
    stdio: 'inherit',
    timeout: 120000,
  });
  execFileSync(
    process.execPath,
    [
      resolve(root, process.argv.includes('--alert-fixtures') ? 'scripts/capture-gitlab-alert-rendering.mjs' : 'scripts/audit-gitlab-product-baseline.mjs'),
      process.argv.includes('--alerts') ? '--native-alerts'
        : process.argv.includes('--code') ? '--native-code'
        : process.argv.includes('--links') ? '--native-links'
        : process.argv.includes('--capacity') ? '--native-attachment-capacity'
        : process.argv.includes('--attachments') ? '--native-attachments'
        : process.argv.includes('--component') ? '--native-component'
        : process.argv.includes('--insertion') ? '--native-insertion' : '--native-browser',
      '--verify-restart',
      ...(process.argv.includes('--probe-upload-focus') ? ['--probe-upload-focus'] : []),
      ...(process.argv.includes('--debug-links') ? ['--debug-links'] : []),
    ],
    { env, stdio: 'inherit', timeout: 900000 },
  );
} finally {
  execFileSync('docker', [...compose, 'stop', '--timeout', '60', 'baseline'], {
    env,
    stdio: 'inherit',
    timeout: 120000,
  });
}
