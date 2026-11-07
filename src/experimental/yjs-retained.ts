/**
 * Opt-in retained-identity collaboration preview.
 *
 * Uses a separate wire format from /yjs. Never point it at an existing XML room
 * or independently initialize multiple peers. See docs/YJS_RETAINED_PREVIEW.md.
 */
export {
  RetainedYjsCollaborationAdapter,
  createRetainedYjsCollaborationExtension,
  type RetainedYjsCollaborationExtensionOptions,
} from '../yjs/retained-adapter';
export {
  captureRetainedCheckpoint,
  restoreRetainedCheckpoint,
  type RetainedCheckpoint,
  type RetainedCheckpointManifest,
} from '../yjs/retained-checkpoint';
export type { RetainedAdmission, RetainedAdmissionLease } from '../yjs/retained-admission';
export type { DocumentRoomSnapshot } from '../yjs/document-room';
