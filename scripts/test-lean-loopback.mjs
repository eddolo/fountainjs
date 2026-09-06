import { execFileSync } from 'node:child_process';

import { createLeanLoopbackProvider } from '../dist/index.js';
import { createLeanLoopbackBridge } from './lean-loopback-bridge.mjs';

execFileSync('lean', ['--version'], { stdio: 'inherit', windowsHide: true });

const origin = 'http://127.0.0.1:4173';
const bridge = await createLeanLoopbackBridge({
  projectRoot: process.cwd(),
  allowedOrigins: [origin],
});
const browserFetch = (input, init) => fetch(input, {
  ...init,
  headers: { ...Object.fromEntries(new Headers(init?.headers)), origin },
});
const provider = createLeanLoopbackProvider({
  endpoint: bridge.endpoint,
  sessionToken: bridge.sessionToken,
  fetch: browserFetch,
});
const request = (source, version) => ({
  id: `lean-integration-${version}`,
  uri: 'fountain://integration/lean',
  version,
  source,
  blockPath: [0],
});

try {
  const valid = await provider.check(request('example : 1 = 1 := rfl\n', 1), { signal: new AbortController().signal });
  if (valid.status !== 'verified' || valid.diagnostics.some((item) => item.severity === 'error')) {
    throw new Error(`Valid Lean proof was not verified: ${JSON.stringify(valid)}`);
  }
  const invalid = await provider.check(request('example : 1 = 2 := rfl\n', 2), { signal: new AbortController().signal });
  if (invalid.status !== 'errors' || !invalid.diagnostics.some((item) => item.severity === 'error')) {
    throw new Error(`Invalid Lean proof did not produce an error: ${JSON.stringify(invalid)}`);
  }
  process.stdout.write('Real Lean loopback integration verified valid and invalid proofs.\n');
} finally {
  await bridge.close();
}
