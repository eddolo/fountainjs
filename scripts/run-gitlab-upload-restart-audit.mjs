import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux') throw new Error('Run in the isolated Linux Docker environment.');
const root = fileURLToPath(new URL('../', import.meta.url));
const install = JSON.parse(await readFile(resolve(root, 'artifacts/gitlab-native-browser-install/install.json')));
const base = ['compose', '-f', resolve(root, 'integrations/gitlab/runtime/compose.yaml'),
  '-f', resolve(root, 'integrations/gitlab/runtime/compose.frontend.yaml')];
const diagnostic = [...base, '-f', resolve(root, 'integrations/gitlab/runtime/compose.upload-audit.yaml')];
const env = { ...process.env, FOUNTAIN_GITLAB_FRONTEND_ASSETS: resolve(install.source, 'public/assets/webpack'),
  FOUNTAIN_GITLAB_UPLOAD_DIAGNOSTICS: resolve(root, 'integrations/gitlab/runtime/upload_gateway_diagnostics.rb') };
const docker = args => execFileSync('docker', args, { env, stdio: 'inherit', timeout: 120000 });
function restore() {
  try { docker([...diagnostic, 'stop', '--timeout', '60', 'baseline']); }
  finally {
    // Recreate the stopped, ordinary deployment without the initializer mount.
    // Persistent task data/config/log volumes and the frontend bind stay intact.
    docker([...base, 'create', '--force-recreate', 'baseline']);
    const mounts = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .Mounts}}', 'fountain-gitlab-integration-baseline-1'], { encoding: 'utf8' }));
    if (mounts.some(mount => mount.Destination.endsWith('/fountain_upload_gateway_audit.rb')))
      throw new Error('The diagnostic mount was not removed.');
    if (execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', 'fountain-gitlab-integration-baseline-1'], { encoding: 'utf8' }).trim() !== 'false')
      throw new Error('The restored task deployment must stay stopped.');
    console.log('Removed temporary upload diagnostics; ordinary deployment restored and stopped.');
  }
}
if (process.argv.includes('--restore-only')) restore();
else {
  try {
    docker([...diagnostic, 'up', '-d', 'baseline']);
    execFileSync(process.execPath, [resolve(root, 'scripts/audit-gitlab-upload-restart.mjs')], { env, stdio: 'inherit', timeout: 900000 });
  } finally { restore(); }
}
