import type * as Y from 'yjs';
import type { CollaborationExtensionOptions, CollaborationUser } from '../extensions/collaboration';
import type { YjsStructuredAttributesOptions } from './structured-attributes';

export interface YjsAwareness {
  readonly clientID?: number;
  getLocalState(): Record<string, unknown> | null;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: 'change' | 'update', listener: (...args: any[]) => void): void;
  off(event: 'change' | 'update', listener: (...args: any[]) => void): void;
}

export interface YjsProvider {
  readonly awareness?: YjsAwareness;
  connect?(): void | Promise<void>;
  disconnect?(): void | Promise<void>;
  on?(event: 'status', listener: (event: { status?: string } | string) => void): void;
  off?(event: 'status', listener: (event: { status?: string } | string) => void): void;
}

export interface YjsConnectionOptions {
  readonly document: Y.Doc;
  readonly user: CollaborationUser;
  readonly fragment?: Y.XmlFragment;
  readonly fragmentName?: string;
  readonly awareness?: YjsAwareness;
  readonly provider?: YjsProvider;
  readonly awarenessField?: string;
  readonly captureTimeout?: number;
  /** Minimum milliseconds between outgoing awareness writes. Defaults to 32. Set 0 to disable throttling. */
  readonly presenceThrottleMs?: number;
  /** Opt-in granular CRDT storage for selected nested node attributes. */
  readonly structuredAttributes?: YjsStructuredAttributesOptions;
}

export interface YjsExtensionOptions extends YjsConnectionOptions {
  readonly autoConnect?: CollaborationExtensionOptions['autoConnect'];
}
