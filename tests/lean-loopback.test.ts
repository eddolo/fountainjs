import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLeanLoopbackProvider, FOUNTAIN_LEAN_LOOPBACK_PROTOCOL } from '../src/lean';
// The executable bridge deliberately remains plain ESM so the published CLI has no build dependency.
// @ts-expect-error The packaged Node script has no declaration file.
import { createLeanLoopbackBridge, parseLeanCheckResult } from '../scripts/lean-loopback-bridge.mjs';

const temporaryDirectories: string[] = [];
const request = {
  id: 'lean-test-1',
  uri: 'fountain://test/lean',
  version: 1,
  source: 'example : 1 = 1 := rfl\n',
  blockPath: [0],
};

afterEach(() => {
  while (temporaryDirectories.length) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
});

describe('Lean loopback provider', () => {
  it('sends the narrow authenticated protocol without exposing its token in metadata', async () => {
    const fetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error' });
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${'a'.repeat(32)}`);
      expect(headers.get('x-fountain-lean-protocol')).toBe(FOUNTAIN_LEAN_LOOPBACK_PROTOCOL);
      expect(JSON.parse(String(init?.body))).toEqual({
        id: request.id,
        uri: request.uri,
        version: request.version,
        source: request.source,
      });
      return new Response(JSON.stringify({ status: 'verified', diagnostics: [] }));
    });
    const provider = createLeanLoopbackProvider({
      endpoint: 'http://127.0.0.1:32100',
      sessionToken: 'a'.repeat(32),
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(provider.check!(request, { signal: new AbortController().signal }))
      .resolves.toEqual({ status: 'verified', diagnostics: [] });
    expect(JSON.stringify(provider.descriptor)).not.toContain('a'.repeat(32));
    expect(fetch).toHaveBeenCalledWith(new URL('http://127.0.0.1:32100/v1/check'), expect.anything());
  });

  it('rejects non-loopback endpoints, weak secrets, invalid results, and oversized responses', async () => {
    expect(() => createLeanLoopbackProvider({ endpoint: 'https://example.com', sessionToken: 'a'.repeat(32) }))
      .toThrow(/localhost/);
    expect(() => createLeanLoopbackProvider({ endpoint: 'http://localhost:3000', sessionToken: 'weak' }))
      .toThrow(/32-512/);

    const invalid = createLeanLoopbackProvider({
      endpoint: 'http://localhost:3000',
      sessionToken: 'a'.repeat(32),
      fetch: async () => new Response('{}'),
    });
    await expect(invalid.check!(request, { signal: new AbortController().signal })).rejects.toThrow(/invalid check result/);

    const oversized = createLeanLoopbackProvider({
      endpoint: 'http://localhost:3000',
      sessionToken: 'a'.repeat(32),
      fetch: async () => new Response('', { headers: { 'content-length': '1000001' } }),
    });
    await expect(oversized.check!(request, { signal: new AbortController().signal })).rejects.toThrow(/size limit/);
  });
});

describe('Lean loopback bridge', () => {
  it('rejects ambient web requests and permits only an authenticated fixed check operation', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'fountain-lean-project-'));
    temporaryDirectories.push(projectRoot);
    const runLean = vi.fn(async ({ source }: { source: string }) => ({
      exitCode: source.includes('rfl') ? 0 : 1,
      stdout: '',
      stderr: source.includes('rfl') ? '' : 'Main.lean:1:1: error: invalid proof',
      timedOut: false,
      overflow: false,
    }));
    const bridge = await createLeanLoopbackBridge({
      projectRoot,
      allowedOrigins: ['http://127.0.0.1:4173'],
      sessionToken: 's'.repeat(32),
      runLean,
    });
    try {
      const headers = {
        origin: 'http://127.0.0.1:4173',
        authorization: `Bearer ${'s'.repeat(32)}`,
        'content-type': 'application/json',
        'x-fountain-lean-protocol': '1',
      };
      const foreign = await fetch(`${bridge.endpoint}/v1/check`, {
        method: 'POST', headers: { ...headers, origin: 'https://attacker.example' }, body: JSON.stringify(request),
      });
      expect(foreign.status).toBe(403);
      const unauthenticated = await fetch(`${bridge.endpoint}/v1/check`, {
        method: 'POST', headers: { ...headers, authorization: 'Bearer wrong' }, body: JSON.stringify(request),
      });
      expect(unauthenticated.status).toBe(401);
      const injected = await fetch(`${bridge.endpoint}/v1/check`, {
        method: 'POST', headers, body: JSON.stringify({ ...request, command: 'whoami' }),
      });
      expect(injected.status).toBe(400);
      const checked = await fetch(`${bridge.endpoint}/v1/check`, {
        method: 'POST', headers, body: JSON.stringify({ id: request.id, uri: request.uri, version: 1, source: request.source }),
      });
      expect(checked.status).toBe(200);
      await expect(checked.json()).resolves.toEqual({ status: 'verified', diagnostics: [] });
      expect(runLean).toHaveBeenCalledOnce();
      expect(runLean.mock.calls[0]?.[0]).toMatchObject({ source: request.source, projectRoot });
    } finally {
      await bridge.close();
    }
  });

  it('maps Lean CLI diagnostics and distinguishes timeout/output failures', () => {
    expect(parseLeanCheckResult({
      exitCode: 1,
      stdout: '',
      stderr: 'Main.lean:2:4: error: type mismatch\n  rfl',
      timedOut: false,
      overflow: false,
    }, '\nabcdef')).toMatchObject({
      status: 'errors',
      diagnostics: [{ severity: 'error', range: { start: { line: 1, character: 3 } } }],
    });
    expect(parseLeanCheckResult({ exitCode: 1, stdout: '', stderr: '', timedOut: true, overflow: false }))
      .toMatchObject({ status: 'not-checked', message: expect.stringMatching(/timed out/) });
    expect(parseLeanCheckResult({ exitCode: 1, stdout: '', stderr: '', timedOut: false, overflow: true }))
      .toMatchObject({ status: 'not-checked', message: expect.stringMatching(/safety limit/) });
  });
});
