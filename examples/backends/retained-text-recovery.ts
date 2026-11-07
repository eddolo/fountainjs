import * as Y from 'yjs';
import { EditorState, type Node, type NodeJSON, type Schema } from '../../src/core';
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
  readonly currentParagraph: NodeJSON;
  readonly draftParagraph: NodeJSON;
  readonly canEditPlainText: boolean;
}

type ParagraphReplacement = string | { readonly useSavedFormatting: true };

function paragraph(document: Node, nodeId: string) {
  const matches: { node: Node; path: readonly number[] }[] = [];
  document.descendants((node, path) => {
    if (node.attrs.nodeId === nodeId) matches.push({ node, path });
  });
  const match = matches[0];
  if (matches.length !== 1 || match.node.type.name !== 'paragraph' || match.node.content.some(child => !child.isText)) {
    throw new Error('Review requires one identifiable text-only paragraph in each document.');
  }
  return match;
}

const plainRun = (node: Node): boolean => node.childCount === 1 && node.child(0).marks.length === 0;

/** Host-authorized review of a text paragraph in the current handoff destination. */
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
        const currentParagraph = paragraph(active.baseDocument, nodeId).node;
        const draftParagraph = paragraph(draft.baseDocument, nodeId).node;
        const review = Object.freeze({ archiveId, draftId, nodeId, epoch: current.epoch, revision: current.revision,
          currentText: currentParagraph.textContent, draftText: draftParagraph.textContent,
          currentParagraph: currentParagraph.toJSON(), draftParagraph: draftParagraph.toJSON(),
          canEditPlainText: plainRun(currentParagraph) && plainRun(draftParagraph) });
        return { review, snapshot: current, draftParagraph };
      } finally { active.document.destroy(); }
    } finally { draft.document.destroy(); }
  }

  async preview(request: DraftParagraph): Promise<RetiredParagraphReview> {
    return (await this.loadReview(request)).review;
  }

  async apply(review: RetiredParagraphReview, replacement: ParagraphReplacement) {
    const { archiveId, draftId, nodeId, epoch, revision, currentText, draftText } = review;
    if (typeof replacement === 'string') {
      if (!replacement.trim() || replacement.length > 20_000 || /[\r\n]/.test(replacement)) {
        throw new Error('Enter one nonempty line of at most 20,000 characters.');
      }
    } else if (replacement?.useSavedFormatting !== true) {
      throw new Error('Choose a reviewed replacement.');
    }
    const { review: verified, snapshot, draftParagraph } = await this.loadReview({ archiveId, draftId, nodeId });
    if (verified.epoch !== epoch || verified.revision !== revision
      || verified.currentText !== currentText || verified.draftText !== draftText) {
      throw new RetainedRoomError('revision-conflict', 'The review is stale. Compare the latest room and saved draft again.');
    }
    if (typeof replacement === 'string' && !verified.canEditPlainText) {
      throw new Error('Manual text requires a single unformatted run in each version. Use the saved paragraph instead.');
    }
    const restored = await restoreRetainedCheckpoint(snapshot.checkpoint, this.schema, this.schemaVersion);
    try {
      const store = new RetainedDocumentStore(restored.document, restored.manifest.room, this.schema, () => `review-${crypto.randomUUID()}`);
      try {
        const doc = store.read(), target = paragraph(doc, nodeId);
        const state = EditorState.create({ schema: this.schema, doc });
        const transaction = state.createTransaction();
        if (typeof replacement === 'string') {
          transaction.replaceText([...target.path, 0], 0, currentText.length, replacement);
        } else {
          transaction.replaceNode(target.path, [target.node.copy(draftParagraph.content)]);
        }
        if (transaction.doc.eq(doc)) return snapshot;
        const basis = Y.encodeStateVector(restored.document);
        store.apply(transaction);
        return await this.room.write({ epoch, expectedRevision: revision, update: Y.encodeStateAsUpdate(restored.document, basis) });
      } finally { store.destroy(); }
    } finally { restored.document.destroy(); }
  }
}
