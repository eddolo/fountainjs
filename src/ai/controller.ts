import type { Editor } from '../core/editor';
import { Selection } from '../core/selection';
import { getNodeAtPath, getTextRangeSegments } from '../core/transaction/path';
import type {
  AIAdapter,
  AIControllerListener,
  AIControllerSnapshot,
  AIRequestEnvelope,
  AIReviewEvent,
  AIStreamChunk,
  AIStreamingProposal,
  AISuggestOptions,
  AISuggestion,
  AITransformResult,
} from './types';

let requestCounter = 0;
export const MAX_AI_REPLACEMENT_LENGTH = 1_000_000;
export const MAX_AI_EXPLANATION_LENGTH = 100_000;
export const MAX_AI_STREAM_CHUNKS = 10_000;
const MAX_AI_METADATA_LENGTH = 100_000;

function nextId(prefix: string): string {
  requestCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function textForTarget(editor: Editor, target: AIRequestEnvelope['target']): string {
  const segments = getTextRangeSegments(
    editor.state.doc,
    target.path,
    target.from,
    target.endPath,
    target.to,
  );
  let previousParent: string | undefined;
  return segments.map((segment) => {
    const parent = segment.path.slice(0, -1).join('.');
    const separator = previousParent !== undefined && parent !== previousParent ? '\n' : '';
    previousParent = parent;
    return separator + (segment.node.text ?? '').slice(segment.from, segment.to);
  }).join('');
}

function freezeSuggestion(suggestion: AISuggestion): AISuggestion {
  return Object.freeze({
    ...suggestion,
    request: Object.freeze({
      ...suggestion.request,
      target: Object.freeze({
        ...suggestion.request.target,
        path: Object.freeze([...suggestion.request.target.path]),
        endPath: Object.freeze([...suggestion.request.target.endPath]),
      }),
      schema: Object.freeze({
        nodes: Object.freeze([...suggestion.request.schema.nodes]),
        marks: Object.freeze([...suggestion.request.schema.marks]),
      }),
      privacy: Object.freeze({ ...suggestion.request.privacy }),
      ...(suggestion.request.context
        ? { context: Object.freeze({ ...suggestion.request.context }) }
        : {}),
    }),
  });
}

function optionalText(value: unknown, name: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) {
    throw new TypeError(`Invalid ${name} (max ${maximum}).`);
  }
  return value;
}

function normalizeMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid AI metadata.');
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); }
  catch { throw new TypeError('AI metadata must be JSON-serializable.'); }
  if (serialized === undefined || serialized.length > MAX_AI_METADATA_LENGTH || serialized.includes('\0')) {
    throw new TypeError(`Invalid AI metadata (max ${MAX_AI_METADATA_LENGTH}).`);
  }
  return Object.freeze({ ...(value as Readonly<Record<string, unknown>>) });
}

function normalizeResult(value: AITransformResult | string): AITransformResult {
  const candidate = typeof value === 'string' ? { replacement: value } : value;
  if (!candidate || typeof candidate !== 'object') throw new TypeError('The AI adapter returned an invalid result.');
  const replacement = optionalText(candidate.replacement, 'AI replacement', MAX_AI_REPLACEMENT_LENGTH);
  if (!replacement?.trim()) throw new Error('The AI adapter returned an empty replacement.');
  const explanation = optionalText(candidate.explanation, 'AI explanation', MAX_AI_EXPLANATION_LENGTH);
  const model = optionalText(candidate.model, 'AI model', 500);
  const metadata = normalizeMetadata(candidate.metadata);
  return Object.freeze({
    replacement,
    ...(explanation !== undefined ? { explanation } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  });
}

interface AIStreamAccumulator {
  replacement: string;
  explanation: string;
  model?: string;
  metadata?: Readonly<Record<string, unknown>>;
  chunkCount: number;
}

function appendStreamChunk(state: AIStreamAccumulator, rawChunk: AIStreamChunk): void {
  if (!rawChunk || typeof rawChunk !== 'object') throw new TypeError('The AI stream returned an invalid chunk.');
  if (rawChunk.replacementDelta === undefined && rawChunk.explanationDelta === undefined
    && rawChunk.model === undefined && rawChunk.metadata === undefined) {
    throw new TypeError('The AI stream returned an empty chunk.');
  }
  state.chunkCount += 1;
  if (state.chunkCount > MAX_AI_STREAM_CHUNKS) throw new Error('The AI stream exceeded the chunk limit.');
  state.replacement += optionalText(rawChunk.replacementDelta, 'AI replacement delta', MAX_AI_REPLACEMENT_LENGTH) ?? '';
  state.explanation += optionalText(rawChunk.explanationDelta, 'AI explanation delta', MAX_AI_EXPLANATION_LENGTH) ?? '';
  if (state.replacement.length > MAX_AI_REPLACEMENT_LENGTH) throw new Error('The AI stream exceeded the replacement limit.');
  if (state.explanation.length > MAX_AI_EXPLANATION_LENGTH) throw new Error('The AI stream exceeded the explanation limit.');
  if (rawChunk.model !== undefined) state.model = optionalText(rawChunk.model, 'AI model', 500);
  if (rawChunk.metadata !== undefined) state.metadata = normalizeMetadata(rawChunk.metadata);
}

function streamResult(state: AIStreamAccumulator): AITransformResult {
  return normalizeResult({
    replacement: state.replacement,
    ...(state.explanation ? { explanation: state.explanation } : {}),
    ...(state.model ? { model: state.model } : {}),
    ...(state.metadata ? { metadata: state.metadata } : {}),
  });
}

function freezeStreamingProposal(proposal: AIStreamingProposal): AIStreamingProposal {
  return Object.freeze({ ...proposal });
}

export class AIController {
  private readonly listeners = new Set<AIControllerListener>();
  private suggestions: AISuggestion[] = [];
  private snapshot: AIControllerSnapshot = Object.freeze({ status: 'idle', suggestions: Object.freeze([]) });
  private activeAbort?: AbortController;

  constructor(
    public readonly editor: Editor,
    public readonly adapter: AIAdapter,
  ) {
    if (!adapter || (typeof adapter.transform !== 'function' && typeof adapter.stream !== 'function')) {
      throw new TypeError('AI adapter needs transform or stream.');
    }
  }

  getSnapshot = (): AIControllerSnapshot => this.snapshot;

  subscribe = (listener: AIControllerListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  inspectRequest(options: AISuggestOptions): AIRequestEnvelope {
    const { state } = this.editor;
    const selection = state.selection;
    if (selection.kind !== 'text') {
      throw new Error('AI text review requires a text selection. Place a caret or select text first.');
    }
    const node = getNodeAtPath(state.doc, selection.path);
    if (!node.isText) throw new Error('AI requests must target text. Place the cursor inside a text fragment first.');
    const endNode = getNodeAtPath(state.doc, selection.endPath);
    if (!endNode.isText) throw new Error('AI requests must end inside text.');

    const nodeText = node.text ?? '';
    const requestedScope = options.scope ?? 'auto';
    const useSelection = requestedScope === 'selection'
      || (requestedScope === 'auto' && !selection.isCollapsed);
    if (useSelection && selection.isCollapsed) {
      throw new Error('Select some text first, or use the current text fragment.');
    }

    const path = selection.path;
    const endPath = useSelection ? selection.endPath : selection.path;
    const from = useSelection ? selection.from : 0;
    const to = useSelection ? selection.to : nodeText.length;
    const target = { path, endPath, from, to, scope: useSelection ? 'selection' as const : 'text-node' as const };
    const input = textForTarget(this.editor, target);
    if (!input.trim()) throw new Error('The AI request target is empty.');

    const scope = target.scope;
    const includeDocumentContext = options.includeDocumentContext === true;
    return Object.freeze({
      id: nextId('request'),
      action: options.action,
      ...(options.instructions?.trim() ? { instructions: options.instructions.trim() } : {}),
      input,
      target: Object.freeze({ path: Object.freeze([...path]), endPath: Object.freeze([...endPath]), from, to, scope }),
      ...(includeDocumentContext ? { context: Object.freeze({ documentText: this.editor.getText() }) } : {}),
      schema: Object.freeze({
        nodes: Object.freeze(Object.keys(state.schema.nodes)),
        marks: Object.freeze(Object.keys(state.schema.marks)),
      }),
      privacy: Object.freeze({ scope, includesDocumentContext: includeDocumentContext }),
    });
  }

  async suggest(options: AISuggestOptions): Promise<AISuggestion> {
    this.cancel();
    const request = this.inspectRequest(options);
    const abort = new AbortController();
    this.activeAbort = abort;
    this.updateSnapshot('requesting', request);

    try {
      let rawResult: AITransformResult | string;
      if (this.adapter.stream) {
        rawResult = await this.consumeStream(request, abort);
      } else if (this.adapter.transform) {
        rawResult = await this.adapter.transform(request, { signal: abort.signal });
      } else {
        throw new TypeError('AI adapter needs transform or stream.');
      }
      if (abort.signal.aborted) throw new DOMException('The AI request was cancelled.', 'AbortError');
      const result = normalizeResult(rawResult);
      const suggestion = freezeSuggestion({
        id: nextId('suggestion'),
        status: 'pending',
        request,
        original: request.input,
        replacement: result.replacement,
        explanation: result.explanation,
        model: result.model,
        metadata: result.metadata,
        createdAt: Date.now(),
      });
      this.suggestions = [...this.suggestions, suggestion];
      if (this.activeAbort !== abort) throw new DOMException('The AI request was cancelled.', 'AbortError');
      this.activeAbort = undefined;
      this.updateSnapshot('review');
      return suggestion;
    } catch (error) {
      if (this.activeAbort !== abort) throw error;
      this.activeAbort = undefined;
      const message = error instanceof Error ? error.message : 'The AI request failed.';
      this.updateSnapshot('error', undefined, message);
      throw error;
    }
  }

  accept(suggestionOrId: AISuggestion | string): AIReviewEvent {
    const suggestion = this.findPending(suggestionOrId);
    const { target } = suggestion.request;
    let currentText: string | undefined;
    try { currentText = textForTarget(this.editor, target); } catch { currentText = undefined; }
    if (currentText !== suggestion.original) {
      this.replaceSuggestion(suggestion.id, { ...suggestion, status: 'stale' });
      this.updateSnapshot('error', undefined, 'The document changed after this suggestion was created. Request a new suggestion.');
      throw new Error('Cannot apply a stale AI suggestion.');
    }

    const cursor = target.from + suggestion.replacement.length;
    const transaction = this.editor.state.createTransaction();
    if (samePath(target.path, target.endPath)) {
      transaction.replaceText(target.path, target.from, target.to, suggestion.replacement);
    } else {
      transaction.replaceTextRange(target.path, target.from, target.endPath, target.to, suggestion.replacement);
    }
    transaction.setSelection(Selection.cursor(target.path, cursor))
      .setMeta('fountain$ai', {
        suggestionId: suggestion.id,
        requestId: suggestion.request.id,
        action: suggestion.request.action,
      });
    this.editor.dispatch(transaction);
    this.replaceSuggestion(suggestion.id, { ...suggestion, status: 'accepted' });
    this.updateSnapshot(this.hasPendingSuggestions() ? 'review' : 'idle');
    return { suggestionId: suggestion.id, decision: 'accepted', timestamp: Date.now() };
  }

  reject(suggestionOrId: AISuggestion | string): AIReviewEvent {
    const suggestion = this.findPending(suggestionOrId);
    this.replaceSuggestion(suggestion.id, { ...suggestion, status: 'rejected' });
    this.updateSnapshot(this.hasPendingSuggestions() ? 'review' : 'idle');
    return { suggestionId: suggestion.id, decision: 'rejected', timestamp: Date.now() };
  }

  cancel(): void {
    if (!this.activeAbort) return;
    this.activeAbort.abort();
    this.activeAbort = undefined;
    this.updateSnapshot(this.suggestions.some((suggestion) => suggestion.status === 'pending') ? 'review' : 'idle');
  }

  private async consumeStream(request: AIRequestEnvelope, abort: AbortController): Promise<AITransformResult> {
    const stream = this.adapter.stream;
    if (!stream) throw new TypeError('AI streaming adapter is unavailable.');
    const state: AIStreamAccumulator = { replacement: '', explanation: '', chunkCount: 0 };
    const createdAt = Date.now();
    const publish = () => {
      const proposal = freezeStreamingProposal({
        request,
        original: request.input,
        replacement: state.replacement,
        ...(state.explanation ? { explanation: state.explanation } : {}),
        ...(state.model ? { model: state.model } : {}),
        ...(state.metadata ? { metadata: state.metadata } : {}),
        chunkCount: state.chunkCount,
        createdAt,
      });
      this.updateSnapshot('streaming', request, undefined, proposal);
    };
    publish();
    for await (const rawChunk of stream(request, { signal: abort.signal })) {
      if (abort.signal.aborted || this.activeAbort !== abort) {
        throw new DOMException('The AI request was cancelled.', 'AbortError');
      }
      appendStreamChunk(state, rawChunk);
      publish();
    }
    if (abort.signal.aborted || this.activeAbort !== abort) {
      throw new DOMException('The AI request was cancelled.', 'AbortError');
    }
    return streamResult(state);
  }

  private findPending(suggestionOrId: AISuggestion | string): AISuggestion {
    const id = typeof suggestionOrId === 'string' ? suggestionOrId : suggestionOrId.id;
    const suggestion = this.suggestions.find((candidate) => candidate.id === id);
    if (!suggestion) throw new Error(`Unknown AI suggestion: ${id}`);
    if (suggestion.status !== 'pending') throw new Error(`AI suggestion ${id} is already ${suggestion.status}.`);
    return suggestion;
  }

  private replaceSuggestion(id: string, replacement: AISuggestion): void {
    this.suggestions = this.suggestions.map((suggestion) => suggestion.id === id
      ? freezeSuggestion(replacement)
      : suggestion);
  }

  private hasPendingSuggestions(): boolean {
    return this.suggestions.some((suggestion) => suggestion.status === 'pending');
  }

  private updateSnapshot(
    status: AIControllerSnapshot['status'],
    activeRequest?: AIRequestEnvelope,
    error?: string,
    streamingProposal?: AIStreamingProposal,
  ): void {
    this.snapshot = Object.freeze({
      status,
      ...(activeRequest ? { activeRequest } : {}),
      ...(streamingProposal ? { streamingProposal } : {}),
      suggestions: Object.freeze([...this.suggestions]),
      ...(error ? { error } : {}),
    });
    this.listeners.forEach((listener) => listener());
  }
}

export function createAIAdapter(
  transform: NonNullable<AIAdapter['transform']>,
): AIAdapter {
  if (typeof transform !== 'function') throw new TypeError('AI transform must be a function.');
  return { transform };
}

export function createStreamingAIAdapter(
  stream: NonNullable<AIAdapter['stream']>,
): AIAdapter {
  if (typeof stream !== 'function') throw new TypeError('AI stream must be a function.');
  return {
    stream,
    async transform(request, context) {
      const state: AIStreamAccumulator = { replacement: '', explanation: '', chunkCount: 0 };
      for await (const chunk of stream(request, context)) {
        if (context.signal.aborted) throw new DOMException('The AI request was cancelled.', 'AbortError');
        appendStreamChunk(state, chunk);
      }
      if (context.signal.aborted) throw new DOMException('The AI request was cancelled.', 'AbortError');
      return streamResult(state);
    },
  };
}
