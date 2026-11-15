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
const diagrams = process.argv.includes('--diagrams') || process.argv.includes('--diagram-fixtures') || process.argv.includes('--diagram-authoring') || process.argv.includes('--diagram-reader');
if (diagrams) compose.push('-f', resolve(root, 'integrations/gitlab/runtime/compose.diagrams.yaml'));
try {
  if (diagrams) execFileSync('docker', [...compose, 'up', '-d', 'diagram-server'], { env, stdio: 'inherit', timeout: 120000 });
  execFileSync('docker', [...compose, 'up', '-d', 'baseline'], {
    env,
    stdio: 'inherit',
    timeout: 120000,
  });
  if (process.argv.includes('--capture-footnotes')) {
    if (!process.argv.includes('--footnote-source')) throw new Error('Footnote refresh requires the footnote-source browser profile.');
    execFileSync(process.execPath, [resolve(root, 'scripts/capture-gitlab-alert-rendering.mjs'), '--footnotes'],
      { env, stdio: 'inherit', timeout: 300000 });
  }
  execFileSync(
    process.execPath,
    [
      resolve(root, ['--alert-fixtures', '--media-fixtures', '--reference-fixtures', '--reference-context-fixtures', '--diagram-fixtures', '--frontmatter-fixtures', '--quick-actions-fixtures', '--quick-action-commands', '--autocomplete-fixtures', '--footnote-fixtures', '--footnote-probe-fixtures', '--footnote-editing-fixtures'].some(flag => process.argv.includes(flag)) ? 'scripts/capture-gitlab-alert-rendering.mjs' : 'scripts/audit-gitlab-product-baseline.mjs'),
      ...(process.argv.includes('--footnote-editing-fixtures') ? ['--footnote-editing'] : []),
      ...(process.argv.includes('--footnote-probe-fixtures') ? ['--footnote-probe'] : []),
      ...(process.argv.includes('--footnote-fixtures') ? ['--footnotes'] : []),
      ...(process.argv.includes('--autocomplete-fixtures') ? ['--autocomplete'] : []),
      ...(process.argv.includes('--quick-action-commands') ? ['--quick-action-commands'] : []),
      ...(process.argv.includes('--quick-actions-fixtures') ? ['--quick-actions'] : []),
      ...(process.argv.includes('--frontmatter-fixtures') ? ['--frontmatter'] : []),
      ...(process.argv.includes('--diagram-fixtures') ? ['--diagrams'] : []),
      ...(process.argv.includes('--media-fixtures') ? ['--media'] : []),
      ...(process.argv.includes('--reference-fixtures') ? ['--references'] : []),
      ...(process.argv.includes('--reference-context-fixtures') ? ['--reference-context'] : []),
      process.argv.includes('--footnote-editing') ? '--native-footnote-editing'
        : process.argv.includes('--footnote-decoded-source') ? '--native-footnote-decoded-source'
        : process.argv.includes('--footnote-source') ? '--native-footnote-source'
        : process.argv.includes('--autocomplete') ? '--native-autocomplete'
        : process.argv.includes('--quick-action-controls') ? '--native-quick-action-controls'
        : process.argv.includes('--quick-actions') ? '--native-quick-actions'
        : process.argv.includes('--context-ui') ? '--native-context-ui'
        : process.argv.includes('--context-menus') ? '--native-context-menus'
        : process.argv.includes('--frontmatter') ? '--native-frontmatter'
        : process.argv.includes('--diagram-reader') ? '--native-diagram-reader'
        : process.argv.includes('--diagram-authoring') ? '--native-diagram-authoring'
        : process.argv.includes('--diagrams') ? '--native-diagrams'
        : process.argv.includes('--references') ? '--native-references'
        : process.argv.includes('--media-files') ? '--native-media-files'
        : process.argv.includes('--media') ? '--native-media'
        : process.argv.includes('--alerts') ? '--native-alerts'
        : process.argv.includes('--code') ? '--native-code'
        : process.argv.includes('--links') ? '--native-links'
        : process.argv.includes('--capacity') ? '--native-attachment-capacity'
        : process.argv.includes('--attachments') ? '--native-attachments'
        : process.argv.includes('--component') ? '--native-component'
        : process.argv.includes('--insertion') ? '--native-insertion' : '--native-browser',
      '--verify-restart',
      ...(process.argv.includes('--reference-contexts') ? ['--reference-contexts'] : []),
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
  if (diagrams) execFileSync('docker', [...compose, 'stop', '--timeout', '30', 'diagram-server'], { env, stdio: 'inherit', timeout: 60000 });
}
