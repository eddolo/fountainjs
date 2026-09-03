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

export interface AIAdapterContext {
  signal: AbortSignal;
}

export interface AIAdapter {
  transform(
    request: AIRequestEnvelope,
    context: AIAdapterContext,
  ): Promise<AITransformResult | string>;
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

export interface AIControllerSnapshot {
  status: 'idle' | 'requesting' | 'review' | 'error';
  activeRequest?: AIRequestEnvelope;
  suggestions: readonly AISuggestion[];
  error?: string;
}

export interface AIReviewEvent {
  suggestionId: string;
  decision: 'accepted' | 'rejected';
  timestamp: number;
}

export type AIControllerListener = () => void;
