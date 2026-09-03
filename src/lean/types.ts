export type LeanProviderMode = 'local' | 'remote' | 'managed' | 'one-shot';
export type LeanDataDestination = 'device' | 'self-hosted' | 'third-party';

/** Human-readable trust metadata applications can show before enabling a provider. */
export interface LeanProviderDescriptor {
  readonly id: string;
  readonly label: string;
  readonly mode: LeanProviderMode;
  readonly dataDestination: LeanDataDestination;
  readonly endpoint?: string;
  readonly dataUseNotice?: string;
}

export interface LeanPosition {
  readonly line: number;
  readonly character: number;
}

export interface LeanRange {
  readonly start: LeanPosition;
  readonly end: LeanPosition;
}

export type LeanDiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface LeanDiagnostic {
  readonly range: LeanRange;
  readonly severity: LeanDiagnosticSeverity;
  readonly message: string;
  readonly code?: string;
  readonly source?: string;
}

export interface LeanGoal {
  readonly id: string;
  readonly target: string;
  readonly hypotheses?: readonly string[];
  readonly range?: LeanRange;
}

export interface LeanHover {
  readonly markdown: string;
  readonly range?: LeanRange;
}

export interface LeanCompletion {
  readonly label: string;
  readonly insertText?: string;
  readonly detail?: string;
  readonly documentation?: string;
  readonly kind?: string;
}

/** Complete source disclosure passed only to the explicitly selected provider. */
export interface LeanRequest {
  readonly id: string;
  readonly uri: string;
  readonly version: number;
  readonly source: string;
  readonly blockPath: readonly number[];
  readonly position?: LeanPosition;
}

export interface LeanProviderContext {
  readonly signal: AbortSignal;
}

export interface LeanCheckResult {
  readonly status: 'verified' | 'errors' | 'not-checked';
  readonly diagnostics: readonly LeanDiagnostic[];
  readonly message?: string;
}

/**
 * A host implements whichever Lean operations its service supports. FountainJS
 * never chooses an endpoint, transports credentials, or assumes an LSP exists.
 */
export interface LeanProvider {
  readonly descriptor: LeanProviderDescriptor;
  check?: (request: LeanRequest, context: LeanProviderContext) => Promise<LeanCheckResult>;
  goals?: (request: LeanRequest, context: LeanProviderContext) => Promise<readonly LeanGoal[]>;
  hover?: (request: LeanRequest, context: LeanProviderContext) => Promise<LeanHover | null>;
  complete?: (request: LeanRequest, context: LeanProviderContext) => Promise<readonly LeanCompletion[]>;
  dispose?: () => void | Promise<void>;
}

export type LeanControllerStatus = 'source-only' | 'idle' | 'requesting' | 'ready' | 'stale' | 'error';

export interface LeanControllerSnapshot {
  readonly status: LeanControllerStatus;
  readonly provider?: LeanProviderDescriptor;
  readonly activeRequest?: LeanRequest;
  readonly check?: LeanCheckResult;
  readonly goals?: readonly LeanGoal[];
  readonly hover?: LeanHover | null;
  readonly completions?: readonly LeanCompletion[];
  readonly error?: string;
}

export interface LeanRequestOptions {
  readonly blockPath?: readonly number[];
  readonly uri?: string;
  readonly position?: LeanPosition;
}

export interface LeanControllerOptions {
  /** Off by default because one provider may be shared by several editors. */
  readonly disposeProvider?: boolean;
}

export type LeanControllerListener = () => void;
