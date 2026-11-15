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
const fixtureFlags = ['--alert-fixtures', '--media-fixtures', '--reference-fixtures', '--reference-context-fixtures', '--diagram-fixtures', '--frontmatter-fixtures', '--quick-actions-fixtures', '--quick-action-commands', '--autocomplete-fixtures', '--footnote-fixtures', '--footnote-probe-fixtures', '--footnote-editing-fixtures', '--footnote-renaming-fixtures'];
const footnoteRoundtrip = process.argv.includes('--footnote-roundtrip-fixtures');
const capturingFixtures = footnoteRoundtrip || fixtureFlags.some(flag => process.argv.includes(flag));
// The stock baseline uses compose.yaml alone. Native integration runs declare
// this separate, pinned server repair explicitly in their deployment receipt.
// Existing reference captures continue to use the original server by default.
if (!capturingFixtures || footnoteRoundtrip || process.argv.includes('--verify-footnote-server')) {
execFileSync(process.execPath, [resolve(root, 'scripts/prepare-gitlab-footnote-server.mjs'), install.source], { stdio: 'inherit', timeout: 30000 });
const footnoteServer = JSON.parse(await readFile(resolve(root, 'artifacts/gitlab-native-footnote-server/build.json')));
const serverTarget = '/opt/gitlab/embedded/service/gitlab-rails/lib/banzai/filter/footnote_filter.rb';
const originalServerHash = execFileSync('docker', ['run', '--rm', '--network=none', '--entrypoint', 'sha256sum',
  'gitlab/gitlab-ce:19.5.3-ce.0@sha256:60fc37e470aca439ead4b6e3ed8f578d9e85c954b84b611b5f323a32a9e47615', serverTarget],
{ encoding: 'utf8', timeout: 30000 }).split(/\s/u)[0];
if (originalServerHash !== footnoteServer.originalSha256) throw new Error('The packaged footnote filter differs from its pinned source.');
env.FOUNTAIN_GITLAB_FOOTNOTE_FILTER = resolve(root, 'artifacts/gitlab-native-footnote-server/footnote_filter.rb');
compose.push('-f', resolve(root, 'integrations/gitlab/runtime/compose.footnotes.yaml'));
}
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
  if (process.argv.includes('--verify-footnote-server')) {
    execFileSync(process.execPath, [resolve(root, 'scripts/capture-gitlab-alert-rendering.mjs'), '--footnote-server'],
      { env, stdio: 'inherit', timeout: 300000 });
  }
  if (process.argv.includes('--capture-footnote-roundtrip')) {
    execFileSync(process.execPath, [resolve(root, 'scripts/capture-gitlab-alert-rendering.mjs'), '--footnote-roundtrip'],
      { env, stdio: 'inherit', timeout: 300000 });
  }
  execFileSync(
    process.execPath,
    [
      resolve(root, capturingFixtures ? 'scripts/capture-gitlab-alert-rendering.mjs' : 'scripts/audit-gitlab-product-baseline.mjs'),
      ...(footnoteRoundtrip ? ['--footnote-roundtrip'] : []),
      ...(process.argv.includes('--footnote-renaming-fixtures') ? ['--footnote-renaming'] : []),
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
      process.argv.includes('--footnote-boundary') ? '--native-footnote-boundary'
        : process.argv.includes('--footnote-renaming') ? '--native-footnote-renaming'
        : process.argv.includes('--footnote-editing') ? '--native-footnote-editing'
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
