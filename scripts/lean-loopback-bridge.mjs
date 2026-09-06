#!/usr/bin/env node

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LEAN_LOOPBACK_PROTOCOL = '1';
const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_BODY_LIMIT = 1_100_000;
const DEFAULT_OUTPUT_LIMIT = 1_000_000;

function fail(message) {
  throw new Error(message);
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeOrigins(origins) {
  if (!Array.isArray(origins) || origins.length === 0) fail('At least one explicit browser origin is required.');
  return new Set(origins.map((value) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || value === 'null') {
      fail(`Invalid allowed origin: ${value}`);
    }
    return url.origin;
  }));
}

function normalizeRoot(value) {
  if (!value || !isAbsolute(value)) fail('Lean project root must be an absolute path.');
  const root = resolve(value);
  if (!existsSync(root) || !statSync(root).isDirectory()) fail('Lean project root must be an existing directory.');
  return root;
}

function normalizeToken(value) {
  const token = value ?? randomBytes(32).toString('base64url');
  if (token.length < 32 || token.length > 512 || !/^[\x21-\x7e]+$/.test(token)) fail('Session token must contain 32-512 safe characters.');
  return token;
}

function send(response, status, body, origin) {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(origin ? {
      'access-control-allow-origin': origin,
      'vary': 'Origin',
    } : {}),
  });
  response.end(json);
}

async function readJSON(request, limit) {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function validateRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid Lean check request.');
  const allowed = new Set(['id', 'uri', 'version', 'source']);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail('Lean check request contains an unsupported field.');
  if (typeof value.id !== 'string' || !value.id || value.id.length > 500 || /[\0\r\n]/.test(value.id)) fail('Invalid request id.');
  if (typeof value.uri !== 'string' || value.uri.length > 2_048) fail('Invalid document URI.');
  try { new URL(value.uri); } catch { fail('Invalid document URI.'); }
  if (!Number.isInteger(value.version) || value.version < 0) fail('Invalid document version.');
  if (typeof value.source !== 'string' || value.source.length > 1_000_000 || value.source.includes('\0')) fail('Invalid Lean source.');
  return { id: value.id, uri: value.uri, version: value.version, source: value.source };
}

function appendBounded(chunks, chunk, state, limit, child) {
  state.size += chunk.length;
  if (state.size > limit) {
    state.overflow = true;
    terminateChild(child);
    return;
  }
  chunks.push(chunk);
}

function terminateChild(child) {
  if (!child.pid || child.killed) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    }).unref();
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch { child.kill('SIGKILL'); }
  }
}

export function runLeanProcess({ source, projectRoot, timeoutMs, outputLimit, signal }) {
  return new Promise((resolveRun, rejectRun) => {
    const directory = mkdtempSync(join(tmpdir(), 'fountain-lean-'));
    const sourcePath = join(directory, 'Main.lean');
    writeFileSync(sourcePath, source, { encoding: 'utf8', mode: 0o600 });
    const usesLake = ['lakefile.lean', 'lakefile.toml'].some((name) => existsSync(join(projectRoot, name)));
    const command = usesLake ? 'lake' : 'lean';
    const args = usesLake ? ['env', 'lean', sourcePath] : [sourcePath];
    const child = spawn(command, args, {
      cwd: projectRoot,
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    const state = { size: 0, overflow: false };
    let timedOut = false;
    const cancel = () => terminateChild(child);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => appendBounded(stdout, chunk, state, outputLimit, child));
    child.stderr.on('data', (chunk) => appendBounded(stderr, chunk, state, outputLimit, child));
    child.once('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      rmSync(directory, { recursive: true, force: true });
      rejectRun(error);
    });
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      rmSync(directory, { recursive: true, force: true });
      resolveRun({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        overflow: state.overflow,
      });
    });
  });
}

function pointRange(line, character, source = '') {
  const lines = source.split('\n');
  const lineIndex = Math.min(Math.max(0, line - 1), Math.max(0, lines.length - 1));
  const position = {
    line: lineIndex,
    character: Math.min(Math.max(0, character - 1), (lines[lineIndex] ?? '').length),
  };
  return { start: position, end: position };
}

export function parseLeanCheckResult(result, source = '') {
  if (result.timedOut) return { status: 'not-checked', diagnostics: [], message: 'Lean checking timed out.' };
  if (result.overflow) return { status: 'not-checked', diagnostics: [], message: 'Lean output exceeded the safety limit.' };
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const diagnostics = [];
  const pattern = /^(.*?):(\d+):(\d+):\s+(error|warning|info(?:rmation)?):\s*([\s\S]*?)(?=^.*?:\d+:\d+:\s+(?:error|warning|info(?:rmation)?):|\s*$)/gim;
  for (const match of output.matchAll(pattern)) {
    diagnostics.push({
      range: pointRange(Number(match[2]), Number(match[3]), source),
      severity: match[4].toLowerCase().startsWith('warn') ? 'warning'
        : match[4].toLowerCase().startsWith('info') ? 'information' : 'error',
      message: match[5].trim().slice(0, 10_000) || 'Lean reported a diagnostic.',
      source: 'lean',
    });
  }
  if (result.exitCode === 0 && !diagnostics.some((item) => item.severity === 'error')) {
    return { status: 'verified', diagnostics };
  }
  if (diagnostics.length === 0) {
    diagnostics.push({
      range: pointRange(1, 1, source),
      severity: 'error',
      message: output.slice(0, 10_000) || `Lean exited with code ${result.exitCode}.`,
      source: 'lean',
    });
  }
  return { status: 'errors', diagnostics };
}

export async function createLeanLoopbackBridge(options) {
  const projectRoot = normalizeRoot(options.projectRoot);
  const allowedOrigins = normalizeOrigins(options.allowedOrigins);
  const sessionToken = normalizeToken(options.sessionToken);
  const port = options.port ?? 0;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  const concurrency = options.concurrency ?? 2;
  const runLean = options.runLean ?? runLeanProcess;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) fail('Invalid bridge port.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) fail('Invalid Lean timeout.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) fail('Invalid concurrency limit.');
  let active = 0;

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) return send(response, 403, { error: 'Origin is not allowed.' });
    if (request.method === 'OPTIONS') {
      if (request.url !== '/v1/check' || request.headers['access-control-request-method'] !== 'POST') {
        return send(response, 404, { error: 'Unknown Lean operation.' }, origin);
      }
      response.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'authorization, content-type, x-fountain-lean-protocol',
        'access-control-max-age': '300',
        'cache-control': 'no-store',
        'vary': 'Origin',
      });
      return response.end();
    }
    if (request.method !== 'POST' || request.url !== '/v1/check') return send(response, 404, { error: 'Unknown Lean operation.' }, origin);
    if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return send(response, 415, { error: 'JSON is required.' }, origin);
    if (request.headers['x-fountain-lean-protocol'] !== LEAN_LOOPBACK_PROTOCOL) return send(response, 400, { error: 'Unsupported FountainJS Lean protocol.' }, origin);
    const authorization = String(request.headers.authorization ?? '');
    if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), sessionToken)) return send(response, 401, { error: 'Invalid session token.' }, origin);
    if (active >= concurrency) return send(response, 429, { error: 'Lean checker is busy.' }, origin);
    active += 1;
    const abort = new AbortController();
    request.once('close', () => {
      if (!request.complete) abort.abort();
    });
    try {
      const checkRequest = validateRequest(await readJSON(request, bodyLimit));
      const result = await runLean({
        source: checkRequest.source,
        projectRoot,
        timeoutMs,
        outputLimit,
        signal: abort.signal,
      });
      send(response, 200, parseLeanCheckResult(result, checkRequest.source), origin);
    } catch (error) {
      const status = Number(error?.status) || 400;
      send(response, status, { error: String(error?.message ?? error).slice(0, 10_000) }, origin);
    } finally {
      active -= 1;
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, LOOPBACK_HOST, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('Lean bridge did not obtain a TCP address.');
  return Object.freeze({
    endpoint: `http://${LOOPBACK_HOST}:${address.port}`,
    sessionToken,
    projectRoot,
    allowedOrigins: Object.freeze([...allowedOrigins]),
    close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())),
  });
}

function parseCLI(argv) {
  const values = { origins: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--project' && value) { values.projectRoot = resolve(value); index += 1; }
    else if (flag === '--origin' && value) { values.origins.push(value); index += 1; }
    else if (flag === '--port' && value) { values.port = Number(value); index += 1; }
    else fail(`Unknown or incomplete option: ${flag}`);
  }
  return values;
}

async function main() {
  const args = parseCLI(process.argv.slice(2));
  const token = process.env.FOUNTAIN_LEAN_SESSION_TOKEN;
  const bridge = await createLeanLoopbackBridge({
    projectRoot: args.projectRoot,
    allowedOrigins: args.origins,
    port: args.port,
    ...(token ? { sessionToken: token } : {}),
  });
  process.stdout.write(`${JSON.stringify({
    endpoint: bridge.endpoint,
    sessionToken: bridge.sessionToken,
    projectRoot: bridge.projectRoot,
    allowedOrigins: bridge.allowedOrigins,
  })}\n`);
  const close = async () => { await bridge.close(); process.exit(0); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
