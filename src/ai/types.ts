export type AIAction = 'improve' | 'shorten' | 'expand' | 'fix-grammar' | 'translate' | 'custom';

export type AIContentScope = 'selection' | 'text-node';

export interface AIRequestTarget {
  path: readonly number[];
  endPath: readonly number[];
  from: number;
  to: number;
  scope: AIContentScope;
}

/**
 * The complete, serializable payload an adapter receives. Applications can
 * show this object to a user before any network call is made.
 */
export interface AIRequestEnvelope {
  id: string;
  action: AIAction;
  instructions?: string;
  input: string;
  target: AIRequestTarget;
  context?: {
    documentText: string;
  };
  schema: {
    nodes: readonly string[];
    marks: readonly string[];
  };
  privacy: {
    scope: AIContentScope;
    includesDocumentContext: boolean;
  };
}

export interface AITransformResult {
  replacement: string;
  explanation?: string;
  model?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

/** One append-only update from a streaming adapter. */
export interface AIStreamChunk {
  readonly replacementDelta?: string;
  readonly explanationDelta?: string;
  readonly model?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AIAdapterContext {
  signal: AbortSignal;
}

export interface AIAdapter {
  transform(
    request: AIRequestEnvelope,
    context: AIAdapterContext,
  ): Promise<AITransformResult | string>;
  stream?(
    request: AIRequestEnvelope,
    context: AIAdapterContext,
  ): AsyncIterable<AIStreamChunk>;
}

export interface AISuggestOptions {
  action: AIAction;
  instructions?: string;
  /** Uses selected text when present, or the current text fragment by default. */
  scope?: 'auto' | AIContentScope;
  /** Off by default. When enabled, the complete document plain text is sent. */
  includeDocumentContext?: boolean;
}

export type AISuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'stale';

export interface AISuggestion {
  id: string;
  status: AISuggestionStatus;
  request: AIRequestEnvelope;
  original: string;
  replacement: string;
  explanation?: string;
  model?: string;
  metadata?: Readonly<Record<string, unknown>>;
  createdAt: number;
}

/** Transient preview only. It is never written into editor state. */
export interface AIStreamingProposal {
  readonly request: AIRequestEnvelope;
  readonly original: string;
  readonly replacement: string;
  readonly explanation?: string;
  readonly model?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly chunkCount: number;
  readonly createdAt: number;
}

export interface AIControllerSnapshot {
  status: 'idle' | 'requesting' | 'streaming' | 'review' | 'error';
  activeRequest?: AIRequestEnvelope;
  streamingProposal?: AIStreamingProposal;
  suggestions: readonly AISuggestion[];
  error?: string;
}

export interface AIReviewEvent {
  suggestionId: string;
  decision: 'accepted' | 'rejected';
  timestamp: number;
}

export type AIControllerListener = () => void;
