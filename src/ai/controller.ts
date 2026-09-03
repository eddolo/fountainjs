import type { Editor } from '../core/editor';
import { Selection } from '../core/selection';
import { getNodeAtPath } from '../core/transaction/path';
import type {
  AIAdapter,
  AIControllerListener,
  AIControllerSnapshot,
  AIRequestEnvelope,
  AIReviewEvent,
  AISuggestOptions,
  AISuggestion,
} from './types';

let requestCounter = 0;

function nextId(prefix: string): string {
  requestCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function textForTarget(editor: Editor, target: AIRequestEnvelope['target']): string {
  const start = getNodeAtPath(editor.state.doc, target.path);
  if (samePath(target.path, target.endPath)) return (start.text ?? '').slice(target.from, target.to);
  const startParent = target.path.slice(0, -1);
  const endParent = target.endPath.slice(0, -1);
  if (!samePath(startParent, endParent)) throw new Error('AI selections cannot cross block boundaries yet.');
  const startIndex = target.path.at(-1) as number;
  const endIndex = target.endPath.at(-1) as number;
  const parent = getNodeAtPath(editor.state.doc, startParent);
  return parent.content.slice(startIndex, endIndex + 1).map((node, index, selected) => {
    const value = node.text ?? '';
    if (index === 0) return value.slice(target.from);
    if (index === selected.length - 1) return value.slice(0, target.to);
    return value;
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

export class AIController {
  private readonly listeners = new Set<AIControllerListener>();
  private suggestions: AISuggestion[] = [];
  private snapshot: AIControllerSnapshot = Object.freeze({ status: 'idle', suggestions: Object.freeze([]) });
  private activeAbort?: AbortController;

  constructor(
    public readonly editor: Editor,
    public readonly adapter: AIAdapter,
  ) {}

  getSnapshot = (): AIControllerSnapshot => this.snapshot;

  subscribe = (listener: AIControllerListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  inspectRequest(options: AISuggestOptions): AIRequestEnvelope {
    const { state } = this.editor;
    const selection = state.selection;
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
      const rawResult = await this.adapter.transform(request, { signal: abort.signal });
      if (abort.signal.aborted) throw new DOMException('The AI request was cancelled.', 'AbortError');
      const result = typeof rawResult === 'string' ? { replacement: rawResult } : rawResult;
      if (typeof result.replacement !== 'string' || !result.replacement.trim()) {
        throw new Error('The AI adapter returned an empty replacement.');
      }
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
  ): void {
    this.snapshot = Object.freeze({
      status,
      ...(activeRequest ? { activeRequest } : {}),
      suggestions: Object.freeze([...this.suggestions]),
      ...(error ? { error } : {}),
    });
    this.listeners.forEach((listener) => listener());
  }
}

export function createAIAdapter(
  transform: AIAdapter['transform'],
): AIAdapter {
  return { transform };
}
