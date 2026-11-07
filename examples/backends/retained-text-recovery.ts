import * as Y from 'yjs';
import { EditorState, type Node, type Schema } from '../../src/core';
import { restoreRetainedCheckpoint } from '../../src/yjs/retained-checkpoint';
import { RetainedDocumentStore } from '../../src/yjs/retained-document';
import { RetainedRoomHandoff, type RetainedHandoffRepository } from '../../src/yjs/retained-handoff';
import { CoordinatedRetainedRoom } from '../../src/yjs/retained-room-coordinator';
import { RetainedRoomError } from '../../src/yjs/retained-room-store';

interface DraftParagraph {
  readonly archiveId: string;
  readonly draftId: string;
  readonly nodeId: string;
}

export interface RetiredParagraphReview extends DraftParagraph {
  readonly epoch: string;
  readonly revision: number;
  readonly currentText: string;
  readonly draftText: string;
}

function paragraph(document: Node, nodeId: string) {
  const matches: { node: Node; path: readonly number[] }[] = [];
  document.descendants((node, path) => {
    if (node.attrs.nodeId === nodeId) matches.push({ node, path });
  });
  const match = matches[0];
  if (matches.length !== 1 || match.node.type.name !== 'paragraph' || match.node.childCount !== 1
    || !match.node.child(0).isText || match.node.child(0).marks.length) {
    throw new Error('Review requires one identifiable paragraph with a single plain-text run in each document.');
  }
  return { text: match.node.textContent, path: [...match.path, 0] };
}

/** Host-authorized review of a plain paragraph in the current handoff destination. */
export class RetainedTextRecovery {
  private readonly room: CoordinatedRetainedRoom;
  private readonly handoff: RetainedRoomHandoff;

  constructor(private readonly repository: RetainedHandoffRepository, private readonly key: string,
    private readonly schema: Schema, private readonly schemaVersion: string) {
    this.room = new CoordinatedRetainedRoom(repository, key, schema, schemaVersion);
    this.handoff = new RetainedRoomHandoff(repository, key, schema, schemaVersion);
  }

  private async loadReview(request: DraftParagraph) {
    const { archiveId, draftId, nodeId } = request;
    if (typeof nodeId !== 'string' || !nodeId || nodeId.length > 200) throw new Error('Invalid recovery paragraph ID.');
    const saved = await this.handoff.readRetiredDraft(archiveId, draftId);
    if (!saved) throw new Error('Saved offline draft was not found.');
    const archive = await this.repository.readArchive(this.key, archiveId);
    const current = await this.room.snapshot();
    if (!archive || current.phase !== 'active'
      || archive.destination.checkpoint.manifest.roomId !== current.checkpoint.manifest.roomId) {
      throw new RetainedRoomError('stale-epoch', 'The handoff destination is no longer the active room.');
    }
    const draft = await restoreRetainedCheckpoint(saved, this.schema, this.schemaVersion);
    try {
      const active = await restoreRetainedCheckpoint(current.checkpoint, this.schema, this.schemaVersion);
      try {
        const review = Object.freeze({ archiveId, draftId, nodeId, epoch: current.epoch, revision: current.revision,
          currentText: paragraph(active.baseDocument, nodeId).text, draftText: paragraph(draft.baseDocument, nodeId).text });
        return { review, snapshot: current };
      } finally { active.document.destroy(); }
    } finally { draft.document.destroy(); }
  }

  async preview(request: DraftParagraph): Promise<RetiredParagraphReview> {
    return (await this.loadReview(request)).review;
  }

  async apply(review: RetiredParagraphReview, replacement: string) {
    const { archiveId, draftId, nodeId, epoch, revision, currentText, draftText } = review;
    if (typeof replacement !== 'string' || !replacement.trim() || replacement.length > 20_000 || /[\r\n]/.test(replacement)) {
      throw new Error('Enter one nonempty line of at most 20,000 characters.');
    }
    const { review: verified, snapshot } = await this.loadReview({ archiveId, draftId, nodeId });
    if (verified.epoch !== epoch || verified.revision !== revision
      || verified.currentText !== currentText || verified.draftText !== draftText) {
      throw new RetainedRoomError('revision-conflict', 'The review is stale. Compare the latest room and saved draft again.');
    }
    if (replacement === currentText) return snapshot;
    const restored = await restoreRetainedCheckpoint(snapshot.checkpoint, this.schema, this.schemaVersion);
    try {
      const store = new RetainedDocumentStore(restored.document, restored.manifest.room, this.schema, () => `review-${crypto.randomUUID()}`);
      try {
        const doc = store.read(), target = paragraph(doc, nodeId);
        const state = EditorState.create({ schema: this.schema, doc });
        const basis = Y.encodeStateVector(restored.document);
        store.apply(state.createTransaction().replaceText(target.path, 0, target.text.length, replacement));
        return await this.room.write({ epoch, expectedRevision: revision, update: Y.encodeStateAsUpdate(restored.document, basis) });
      } finally { store.destroy(); }
    } finally { restored.document.destroy(); }
  }
}
