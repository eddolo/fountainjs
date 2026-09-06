import { createLeanProvider, MAX_LEAN_SOURCE_LENGTH } from './controller';
import type { LeanCheckResult, LeanProvider, LeanRequest } from './types';

export const FOUNTAIN_LEAN_LOOPBACK_PROTOCOL = '1';
export const MAX_LEAN_LOOPBACK_RESPONSE_LENGTH = 1_000_000;

export interface LeanLoopbackProviderOptions {
  /** HTTP(S) URL printed by the separately launched FountainJS Lean bridge. */
  readonly endpoint: string;
  /** Per-process secret printed by the bridge. It is retained only by this closure. */
  readonly sessionToken: string;
  readonly label?: string;
  readonly timeoutMs?: number;
  /** Primarily useful to hosts with their own fetch implementation and to tests. */
  readonly fetch?: typeof globalThis.fetch;
}

function validateLoopbackEndpoint(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new TypeError('Lean loopback endpoint must be an absolute URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) {
    throw new TypeError('Lean loopback endpoint must use HTTP(S) on localhost.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('Lean loopback endpoint cannot contain credentials, a query, or a fragment.');
  }
  if (url.pathname !== '/') throw new TypeError('Lean loopback endpoint must not contain a path.');
  url.pathname = '/v1/check';
  return url;
}

function validateToken(value: string): string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 512 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new TypeError('Lean loopback session token must contain 32-512 safe characters.');
  }
  return value;
}

function validateResult(value: unknown): LeanCheckResult {
  if (!value || typeof value !== 'object') throw new Error('Lean loopback bridge returned invalid JSON.');
  const candidate = value as Partial<LeanCheckResult>;
  if (!['verified', 'errors', 'not-checked'].includes(candidate.status ?? '') || !Array.isArray(candidate.diagnostics)) {
    throw new Error('Lean loopback bridge returned an invalid check result.');
  }
  return candidate as LeanCheckResult;
}

async function boundedJSON(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_LEAN_LOOPBACK_RESPONSE_LENGTH) {
    throw new Error('Lean loopback response exceeded the size limit.');
  }
  const text = await response.text();
  if (text.length > MAX_LEAN_LOOPBACK_RESPONSE_LENGTH) {
    throw new Error('Lean loopback response exceeded the size limit.');
  }
  try { return JSON.parse(text); }
  catch { throw new Error('Lean loopback bridge returned invalid JSON.'); }
}

function requestBody(request: LeanRequest): string {
  if (request.source.length > MAX_LEAN_SOURCE_LENGTH || request.source.includes('\0')) {
    throw new Error('Lean source is invalid or exceeds the size limit.');
  }
  return JSON.stringify({
    id: request.id,
    uri: request.uri,
    version: request.version,
    source: request.source,
  });
}

/** Connects Fountain's provider contract to the separately launched local checker. */
export function createLeanLoopbackProvider(options: LeanLoopbackProviderOptions): LeanProvider {
  const endpoint = validateLoopbackEndpoint(options.endpoint);
  const sessionToken = validateToken(options.sessionToken);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== 'function') throw new Error('This runtime does not provide fetch.');
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new RangeError('Lean loopback timeout must be between 100 and 120000 ms.');
  }

  return createLeanProvider({
    descriptor: {
      id: 'fountainjs-lean-loopback',
      label: options.label ?? 'Lean on this computer',
      mode: 'local',
      dataDestination: 'device',
      endpoint: endpoint.origin,
      dataUseNotice: 'Lean source is sent only to the loopback checker running on this device.',
    },
    async check(request, context) {
      const timeout = new AbortController();
      const cancel = () => timeout.abort(context.signal.reason);
      if (context.signal.aborted) cancel();
      else context.signal.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => timeout.abort(new Error('Lean loopback request timed out.')), timeoutMs);
      try {
        const response = await fetchImplementation(endpoint, {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${sessionToken}`,
            'content-type': 'application/json',
            'x-fountain-lean-protocol': FOUNTAIN_LEAN_LOOPBACK_PROTOCOL,
          },
          body: requestBody(request),
          signal: timeout.signal,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
        });
        const payload = await boundedJSON(response);
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : `Lean loopback request failed (${response.status}).`;
          throw new Error(message.slice(0, 10_000));
        }
        return validateResult(payload);
      } finally {
        clearTimeout(timer);
        context.signal.removeEventListener('abort', cancel);
      }
    },
  });
}
