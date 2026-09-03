import type { Editor, Node } from '../core';
import { NodeSelection } from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import type {
  LeanCheckResult,
  LeanCompletion,
  LeanControllerListener,
  LeanControllerOptions,
  LeanControllerSnapshot,
  LeanDiagnostic,
  LeanGoal,
  LeanHover,
  LeanPosition,
  LeanProvider,
  LeanProviderDescriptor,
  LeanRange,
  LeanRequest,
  LeanRequestOptions,
} from './types';

export const MAX_LEAN_SOURCE_LENGTH = 1_000_000;
const MAX_PROVIDER_ITEMS = 5_000;
let leanRequestCounter = 0;

function nonEmpty(value: unknown, name: string, maximum = 10_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string no longer than ${maximum} characters.`);
  }
  return value;
}

function validateEndpoint(descriptor: LeanProviderDescriptor): void {
  if (!descriptor.endpoint) return;
  nonEmpty(descriptor.endpoint, 'Lean provider endpoint', 2_048);
  let url: URL;
  try { url = new URL(descriptor.endpoint); }
  catch { throw new TypeError('Lean provider endpoints must be absolute URLs.'); }
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase());
  if (descriptor.mode === 'local') {
    if (!loopback || !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
      throw new Error('Local Lean providers must use an HTTP(S) or WebSocket loopback endpoint.');
    }
  } else if (!['https:', 'wss:'].includes(url.protocol)) {
    throw new Error('Non-local Lean provider endpoints must use HTTPS or secure WebSockets.');
  }
}

function freezeDescriptor(input: LeanProviderDescriptor): LeanProviderDescriptor {
  const descriptor = {
    ...input,
    id: nonEmpty(input.id, 'Lean provider id', 100),
    label: nonEmpty(input.label, 'Lean provider label', 200),
  };
  if (!['local', 'remote', 'managed', 'one-shot'].includes(descriptor.mode)) throw new TypeError('Unknown Lean provider mode.');
  if (!['device', 'self-hosted', 'third-party'].includes(descriptor.dataDestination)) throw new TypeError('Unknown Lean data destination.');
  if (descriptor.mode === 'local' && descriptor.dataDestination !== 'device') {
    throw new Error('Local Lean providers must keep source on the device.');
  }
  if (descriptor.dataDestination === 'third-party') nonEmpty(descriptor.dataUseNotice, 'Third-party data-use notice', 2_000);
  validateEndpoint(descriptor);
  return Object.freeze(descriptor);
}

/** Validates and freezes a host-supplied provider; it never connects by itself. */
export function createLeanProvider(provider: LeanProvider): LeanProvider {
  if (!provider || typeof provider !== 'object') throw new TypeError('A Lean provider object is required.');
  const operations = ['check', 'goals', 'hover', 'complete'] as const;
  if (!operations.some((name) => typeof provider[name] === 'function')) {
    throw new TypeError('A Lean provider must implement at least one operation.');
  }
  operations.forEach((name) => {
    if (provider[name] !== undefined && typeof provider[name] !== 'function') {
      throw new TypeError(`Lean provider ${name} must be a function.`);
    }
  });
  return Object.freeze({
    descriptor: freezeDescriptor(provider.descriptor),
    ...(provider.check ? { check: provider.check.bind(provider) } : {}),
    ...(provider.goals ? { goals: provider.goals.bind(provider) } : {}),
    ...(provider.hover ? { hover: provider.hover.bind(provider) } : {}),
    ...(provider.complete ? { complete: provider.complete.bind(provider) } : {}),
    ...(provider.dispose ? { dispose: provider.dispose.bind(provider) } : {}),
  });
}

function isLeanBlock(node: Node): boolean {
  return node.type.name === 'code_block' && String(node.attrs.language).toLowerCase() === 'lean';
}

function resolveBlockPath(editor: Editor, supplied?: readonly number[]): readonly number[] {
  if (supplied) {
    const node = getNodeAtPath(editor.state.doc, supplied);
    if (!isLeanBlock(node)) throw new Error('The requested path is not a Lean code block.');
    return Object.freeze([...supplied]);
  }
  const selection = editor.state.selection;
  const candidate = selection instanceof NodeSelection ? selection.nodePath : selection.path;
  for (let length = candidate.length; length > 0; length -= 1) {
    const path = candidate.slice(0, length);
    if (isLeanBlock(getNodeAtPath(editor.state.doc, path))) return Object.freeze([...path]);
  }
  throw new Error('Place the selection inside a Lean code block or provide blockPath.');
}

function positionAtSelection(editor: Editor, blockPath: readonly number[]): LeanPosition | undefined {
  const selection = editor.state.selection;
  if (selection.kind !== 'text' || !selection.isCollapsed) return undefined;
  if (selection.path.length <= blockPath.length || !blockPath.every((part, index) => selection.path[index] === part)) return undefined;
  const block = getNodeAtPath(editor.state.doc, blockPath);
  const childIndex = selection.path[blockPath.length] as number;
  const offset = block.content.slice(0, childIndex).reduce((size, child) => size + child.textContent.length, 0) + selection.from;
  const sourceBefore = block.textContent.slice(0, offset);
  const lines = sourceBefore.split('\n');
  return Object.freeze({ line: lines.length - 1, character: (lines.at(-1) ?? '').length });
}

function validPosition(value: LeanPosition, source: string): LeanPosition {
  if (!Number.isInteger(value.line) || !Number.isInteger(value.character) || value.line < 0 || value.character < 0) {
    throw new RangeError('Lean positions require non-negative integer line and character values.');
  }
  const lines = source.split('\n');
  if (value.line >= lines.length || value.character > (lines[value.line]?.length ?? 0)) {
    throw new RangeError('Lean position exceeds the current source.');
  }
  return Object.freeze({ line: value.line, character: value.character });
}

function freezeRange(value: LeanRange, source: string): LeanRange {
  const start = validPosition(value.start, source);
  const end = validPosition(value.end, source);
  if (end.line < start.line || (end.line === start.line && end.character < start.character)) {
    throw new RangeError('Lean ranges must be ordered.');
  }
  return Object.freeze({ start, end });
}

function normalizeDiagnostics(values: readonly LeanDiagnostic[], source: string): readonly LeanDiagnostic[] {
  if (!Array.isArray(values) || values.length > MAX_PROVIDER_ITEMS) throw new TypeError('Lean diagnostics must be a bounded array.');
  return Object.freeze(values.map((value) => Object.freeze({
    range: freezeRange(value.range, source),
    severity: ['error', 'warning', 'information', 'hint'].includes(value.severity) ? value.severity : 'error',
    message: nonEmpty(value.message, 'Lean diagnostic message'),
    ...(value.code ? { code: String(value.code).slice(0, 500) } : {}),
    ...(value.source ? { source: String(value.source).slice(0, 500) } : {}),
  })));
}

function normalizeCheck(value: LeanCheckResult, source: string): LeanCheckResult {
  if (!value || !['verified', 'errors', 'not-checked'].includes(value.status)) throw new TypeError('Invalid Lean check status.');
  const diagnostics = normalizeDiagnostics(value.diagnostics, source);
  return Object.freeze({
    status: value.status,
    diagnostics,
    ...(value.message ? { message: String(value.message).slice(0, 10_000) } : {}),
  });
}

function normalizeGoals(values: readonly LeanGoal[], source: string): readonly LeanGoal[] {
  if (!Array.isArray(values) || values.length > MAX_PROVIDER_ITEMS) throw new TypeError('Lean goals must be a bounded array.');
  return Object.freeze(values.map((value) => Object.freeze({
    id: nonEmpty(value.id, 'Lean goal id', 500),
    target: nonEmpty(value.target, 'Lean goal target'),
    ...(value.hypotheses ? { hypotheses: Object.freeze(value.hypotheses.map((item: string) => String(item).slice(0, 10_000))) } : {}),
    ...(value.range ? { range: freezeRange(value.range, source) } : {}),
  })));
}

function normalizeHover(value: LeanHover | null, source: string): LeanHover | null {
  if (value === null) return null;
  return Object.freeze({
    markdown: nonEmpty(value.markdown, 'Lean hover content', 100_000),
    ...(value.range ? { range: freezeRange(value.range, source) } : {}),
  });
}

function normalizeCompletions(values: readonly LeanCompletion[]): readonly LeanCompletion[] {
  if (!Array.isArray(values) || values.length > MAX_PROVIDER_ITEMS) throw new TypeError('Lean completions must be a bounded array.');
  return Object.freeze(values.map((value) => Object.freeze({
    label: nonEmpty(value.label, 'Lean completion label', 2_000),
    ...(value.insertText !== undefined ? { insertText: String(value.insertText).slice(0, 100_000) } : {}),
    ...(value.detail ? { detail: String(value.detail).slice(0, 10_000) } : {}),
    ...(value.documentation ? { documentation: String(value.documentation).slice(0, 100_000) } : {}),
    ...(value.kind ? { kind: String(value.kind).slice(0, 500) } : {}),
  })));
}

function sameRequestSource(editor: Editor, request: LeanRequest): boolean {
  try {
    const block = getNodeAtPath(editor.state.doc, request.blockPath);
    return isLeanBlock(block) && block.textContent === request.source;
  } catch { return false; }
}

export class LeanController {
  private readonly listeners = new Set<LeanControllerListener>();
  private activeAbort?: AbortController;
  private snapshot: LeanControllerSnapshot;
  private version = 0;

  constructor(
    public readonly editor: Editor,
    public readonly provider?: LeanProvider,
    private readonly options: LeanControllerOptions = {},
  ) {
    this.provider = provider ? createLeanProvider(provider) : undefined;
    this.snapshot = Object.freeze(this.provider
      ? { status: 'idle', provider: this.provider.descriptor }
      : { status: 'source-only' });
  }

  getSnapshot = (): LeanControllerSnapshot => this.snapshot;

  subscribe = (listener: LeanControllerListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  inspectRequest(options: LeanRequestOptions = {}): LeanRequest {
    const blockPath = resolveBlockPath(this.editor, options.blockPath);
    const source = getNodeAtPath(this.editor.state.doc, blockPath).textContent;
    if (source.length > MAX_LEAN_SOURCE_LENGTH || source.includes('\0')) throw new Error('Lean source is invalid or exceeds the size limit.');
    const position = options.position ?? positionAtSelection(this.editor, blockPath);
    const uri = options.uri === undefined
      ? `fountain://document/lean/${blockPath.join('/')}`
      : nonEmpty(options.uri, 'Lean document URI', 2_048);
    try { new URL(uri); }
    catch { throw new TypeError('Lean document URIs must be absolute URLs.'); }
    this.version += 1;
    leanRequestCounter += 1;
    return Object.freeze({
      id: `lean-${Date.now().toString(36)}-${leanRequestCounter.toString(36)}`,
      uri,
      version: this.version,
      source,
      blockPath,
      ...(position ? { position: validPosition(position, source) } : {}),
    });
  }

  async check(options: LeanRequestOptions = {}): Promise<LeanCheckResult> {
    if (!this.provider?.check) {
      const result = Object.freeze({
        status: 'not-checked' as const,
        diagnostics: Object.freeze([]) as readonly LeanDiagnostic[],
        message: 'No Lean provider is configured; source-only editing remains available.',
      });
      this.update({ status: 'source-only', check: result });
      return result;
    }
    return this.run('check', options, this.provider.check, normalizeCheck);
  }

  async goals(options: LeanRequestOptions = {}): Promise<readonly LeanGoal[]> {
    if (!this.provider?.goals) return this.sourceOnly('goals', Object.freeze([]));
    return this.run('goals', options, this.provider.goals, normalizeGoals);
  }

  async hover(options: LeanRequestOptions = {}): Promise<LeanHover | null> {
    if (!this.provider?.hover) return this.sourceOnly('hover', null);
    return this.run('hover', options, this.provider.hover, normalizeHover);
  }

  async complete(options: LeanRequestOptions = {}): Promise<readonly LeanCompletion[]> {
    if (!this.provider?.complete) return this.sourceOnly('completions', Object.freeze([]));
    return this.run('completions', options, this.provider.complete, (value) => normalizeCompletions(value));
  }

  cancel(): void {
    this.activeAbort?.abort();
    this.activeAbort = undefined;
    this.update({ status: this.provider ? 'idle' : 'source-only' });
  }

  async dispose(): Promise<void> {
    this.cancel();
    this.listeners.clear();
    if (this.options.disposeProvider) await this.provider?.dispose?.();
  }

  private async run<T, R>(
    field: 'check' | 'goals' | 'hover' | 'completions',
    options: LeanRequestOptions,
    operation: (request: LeanRequest, context: { signal: AbortSignal }) => Promise<T>,
    normalize: (value: T, source: string) => R,
  ): Promise<R> {
    this.cancel();
    const request = this.inspectRequest(options);
    const abort = new AbortController();
    this.activeAbort = abort;
    this.update({ status: 'requesting', provider: this.provider?.descriptor, activeRequest: request });
    try {
      const raw = await operation(request, { signal: abort.signal });
      if (abort.signal.aborted || this.activeAbort !== abort) throw new DOMException('The Lean request was cancelled.', 'AbortError');
      if (!sameRequestSource(this.editor, request)) {
        this.activeAbort = undefined;
        this.update({ status: 'stale', provider: this.provider?.descriptor, error: 'The Lean source changed before the provider responded.' });
        throw new Error('Cannot use a stale Lean provider response.');
      }
      const value = normalize(raw, request.source);
      this.activeAbort = undefined;
      this.update({ status: 'ready', provider: this.provider?.descriptor, [field]: value });
      return value;
    } catch (error) {
      if (this.activeAbort === abort) {
        this.activeAbort = undefined;
        const message = error instanceof Error ? error.message : 'The Lean provider failed.';
        this.update({ status: abort.signal.aborted ? 'idle' : 'error', provider: this.provider?.descriptor, error: message });
      }
      throw error;
    }
  }

  private sourceOnly<T>(field: 'goals' | 'hover' | 'completions', value: T): T {
    this.update({ status: 'source-only', [field]: value });
    return value;
  }

  private update(value: LeanControllerSnapshot): void {
    this.snapshot = Object.freeze(value);
    this.listeners.forEach((listener) => listener());
  }
}
