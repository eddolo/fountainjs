import { createCollaborationExtension } from '../extensions/collaboration';
import type { FountainExtension } from '../extensions/extension';
import { RetainedYjsCollaborationAdapter, type RetainedYjsCollaborationExtensionOptions } from './retained-adapter';

export type { YjsAwareness, YjsProvider } from './types';
export type { YjsStructuredAttributesOptions } from './structured-attributes';

/** Versioned retained-identity collaboration. Existing legacy XML rooms are
 * refused without changing their bytes. Open them explicitly through /yjs/legacy
 * or migrate through the document-room authority before using this adapter. */
export interface YjsCollaborationAdapterOptions extends Omit<RetainedYjsCollaborationExtensionOptions, 'autoConnect'> {
  /** @deprecated Retained rooms always preserve conflicting initial roots.
   * This legacy option is accepted for source compatibility and cannot disable
   * preservation. It still configures the explicit /yjs/legacy adapter. */
  readonly preserveConcurrentRoots?: boolean;
}

export interface YjsCollaborationExtensionOptions extends YjsCollaborationAdapterOptions {
  readonly autoConnect?: RetainedYjsCollaborationExtensionOptions['autoConnect'];
}

export class YjsCollaborationAdapter extends RetainedYjsCollaborationAdapter {
  constructor(options: YjsCollaborationAdapterOptions) {
    if (options?.preserveConcurrentRoots !== undefined && typeof options.preserveConcurrentRoots !== 'boolean') {
      throw new TypeError('Invalid Yjs concurrent root policy.');
    }
    super(options);
  }
}

export function createYjsCollaborationExtension(options: YjsCollaborationExtensionOptions): FountainExtension {
  return createCollaborationExtension({
    autoConnect: options.autoConnect,
    adapter: () => new YjsCollaborationAdapter(options),
  });
}
