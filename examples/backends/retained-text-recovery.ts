import * as Y from 'yjs';
import { Editor, EditorState, moveNode, type NodeMove, type Node, type NodeJSON, type Schema } from '../../src/core';
import { registerSharedDirectionIdentity } from '../../src/core/shared-direction';
import { checkpointWire, restoreRetainedCheckpoint, type RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';
import { restoreLegacyCheckpoint, snapshotLegacyProjection, type LegacyProjectionOptions } from '../../src/yjs/legacy-checkpoint';
import { CoordinatedDocumentRoom, documentRoomId, type DocumentCheckpoint, type DocumentReviewOperation } from '../../src/yjs/document-room';
import { CrossFormatRoomHandoff, type CrossFormatRepository } from '../../src/yjs/cross-format-handoff';
import { RetainedDocumentStore } from '../../src/yjs/retained-document';
import { retainedDirectionIdentity } from '../../src/yjs/retained-direction';
import { RetainedRoomHandoff, type RetainedHandoffRepository } from '../../src/yjs/retained-handoff';
import { CoordinatedRetainedRoom, type CoordinatedRoomSnapshot } from '../../src/yjs/retained-room-coordinator';
import { RetainedRoomError } from '../../src/yjs/retained-room-store';
import { assertRetainedWireString } from '../../src/yjs/retained-wire';

interface SavedDraft {
  readonly archiveId: string;
  readonly sourceEpoch?: string;
  readonly draftId: string;
}

interface DraftParagraph extends SavedDraft {
  readonly nodeId: string;
}

type ReviewRepository = CrossFormatRepository & {
  readDocumentReview?(key: string, id: string): Promise<{ digest: string; epoch: string; revision: number } | undefined>;
};

type RecoveryRepository = RetainedHandoffRepository | {
  readonly crossFormat: ReviewRepository;
  readonly projection?: LegacyProjectionOptions;
};

export interface RetiredParagraphReview extends DraftParagraph {
  readonly epoch: string;
  readonly revision: number;
  readonly currentText: string;
  readonly draftText: string;
  readonly currentParagraph: NodeJSON;
  readonly draftParagraph: NodeJSON;
  readonly canEditPlainText: boolean;
  readonly currentLocation: string;
  readonly draftLocation: string;
  readonly canUseSavedPlacement: boolean;
}

type ParagraphReplacement = string | { readonly useSavedFormatting: true } | { readonly content: readonly NodeJSON[] }
  | { readonly useSavedPlacement: true };
type ReviewProof = Pick<RetiredParagraphReview, keyof SavedDraft | 'nodeId' | 'epoch' | 'revision' | 'currentText' | 'draftText'>;

function isRetainedCheckpoint(checkpoint: DocumentCheckpoint): checkpoint is RetainedCheckpoint {
  return checkpoint.manifest.format === 'fountain-retained-checkpoint/1';
}

function composedRuns(schema: Schema, input: readonly NodeJSON[]): readonly Node[] {
  if (!Array.isArray(input) || !input.length || input.length > 500 || JSON.stringify(input).length > 128_000) {
    throw new Error('A combined paragraph needs between 1 and 500 text runs within the request size limit.');
  }
  let units = 0;
  const runs = Array.from(input, run => {
    if (!run || run.type !== 'text' || typeof run.text !== 'string' || !run.text.length || /[\r\n]/.test(run.text)
      || Object.keys(run).some(key => !['type', 'text', 'marks'].includes(key))
      || (run.marks !== undefined && (!Array.isArray(run.marks) || run.marks.length > 32))) {
      throw new Error('Combined paragraphs support single-line text and marks.');
    }
    units += run.text.length;
    if (units > 20_000) throw new Error('Combined paragraphs are limited to 20,000 characters.');
    assertRetainedWireString(run.text);
    return schema.nodeFromJSON(run);
  });
  return Object.freeze(runs);
}

function uniqueBlock(document: Node, nodeId: string) {
  const matches: { node: Node; path: readonly number[] }[] = [];
  document.descendants((node, path) => {
    if (path.length && node.attrs.nodeId === nodeId) matches.push({ node, path });
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function isTextParagraph(node: Node): boolean {
  return node.type.name === 'paragraph' && node.content.every(child => child.isText);
}

function paragraph(document: Node, nodeId: string) {
  const match = uniqueBlock(document, nodeId);
  if (!match || !isTextParagraph(match.node)) {
    throw new Error('Review requires one identifiable text-only paragraph in each document.');
  }
  return match;
}

function indexBlocks(document: Node): Map<string, Node | null> {
  const blocks = new Map<string, Node | null>();
  document.descendants((node, path) => {
    const id = node.attrs.nodeId;
    if (path.length && typeof id === 'string' && id.length > 0 && id.length <= 200) {
      blocks.set(id, blocks.has(id) ? null : node);
    }
  });
  return blocks;
}

const plainRun = (node: Node): boolean => node.childCount === 1 && node.child(0).marks.length === 0;
const stableId = (node: Node | undefined) => typeof node?.attrs.nodeId === 'string' && node.attrs.nodeId ? node.attrs.nodeId : undefined;

function paragraphLocation(doc: Node, path: readonly number[]) {
  const parentPath = path.slice(0, -1), index = path.at(-1)!;
  const parent = parentPath.reduce((node, part) => node.child(part), doc);
  const name = parentPath.length ? parent.type.name.replaceAll('_', ' ') : 'Document';
  const parentId = stableId(parent), previous = stableId(parent.content[index - 1]), next = stableId(parent.content[index + 1]);
  const unique = [parentPath.length ? parentId : undefined, previous, next].every(id => !id || uniqueBlock(doc, id));
  return { parent, label: `${name} · block ${index + 1}`,
    parentPath, parentId, previous, next, unique };
}

function reviewedMove(doc: Node, live: ReturnType<typeof paragraph>, saved: ReturnType<typeof paragraphLocation>): NodeMove | undefined {
  if (!saved.unique) return;
  const parent = saved.parentPath.length ? saved.parentId && uniqueBlock(doc, saved.parentId) : { node: doc, path: [] };
  if (!parent || parent.node.type.name !== saved.parent.type.name) return;
  const siblings = parent.node.content.filter(node => node !== live.node);
  const anchor = (id: string) => {
    const node = uniqueBlock(doc, id)?.node;
    return node ? siblings.indexOf(node) : -1;
  };
  const previous = saved.previous ? anchor(saved.previous) : undefined;
  const next = saved.next ? anchor(saved.next) : undefined;
  if (previous === -1 || next === -1 || previous !== undefined && next !== undefined && previous + 1 !== next) return;
  if (previous === undefined && next === undefined && (saved.parent.childCount !== 1 || siblings.length)) return;
  const index = next ?? (previous === undefined ? 0 : previous + 1);
  if (live.path.length === parent.path.length + 1 && live.path.at(-1) === index
    && parent.path.every((part, offset) => part === live.path[offset])) return;
  return { fromPath: live.path, toParentPath: parent.path, toIndex: index };
}

/** Host-authorized review of a text paragraph in the current handoff destination. */
export class RetainedTextRecovery {
  private readonly room: CoordinatedRetainedRoom | CoordinatedDocumentRoom;
  private readonly reviewRepository?: ReviewRepository;
  private readonly legacyProjection?: LegacyProjectionOptions;
  private readonly readDraft: (request: SavedDraft) => Promise<{ saved: DocumentCheckpoint; roomId: string }>;

  constructor(repository: RecoveryRepository, private readonly key: string,
    private readonly schema: Schema, private readonly schemaVersion: string) {
    if ('crossFormat' in repository) {
      const { crossFormat } = repository;
      this.reviewRepository = crossFormat;
      this.legacyProjection = snapshotLegacyProjection(repository.projection);
      this.room = new CoordinatedDocumentRoom(crossFormat, key, schema, schemaVersion, this.legacyProjection);
      const handoff = new CrossFormatRoomHandoff(crossFormat, key, schema, schemaVersion, this.legacyProjection);
      this.readDraft = async ({ archiveId, sourceEpoch, draftId }) => {
        if (sourceEpoch === undefined) throw new Error('Cross-format review needs the retired writer epoch.');
        const saved = await handoff.readRetiredDraft(archiveId, sourceEpoch, draftId);
        if (!saved) throw new Error('Saved offline draft was not found.');
        const archive = await crossFormat.readCrossArchive(key, archiveId);
        if (archive?.kind !== 'legacy-migration' || saved.manifest.format !== 'fountain-legacy-checkpoint/1') {
          throw new RetainedRoomError('stale-epoch', 'The archive does not lead to a retained migration destination.');
        }
        return { saved, roomId: archive.destinationIdentity };
      };
    } else {
      this.room = new CoordinatedRetainedRoom(repository, key, schema, schemaVersion);
      const handoff = new RetainedRoomHandoff(repository, key, schema, schemaVersion);
      this.readDraft = async ({ archiveId, draftId }) => {
        const saved = await handoff.readRetiredDraft(archiveId, draftId);
        if (!saved) throw new Error('Saved offline draft was not found.');
        const archive = await repository.readArchive(key, archiveId);
        if (!archive) throw new Error('Recovery archive was not found.');
        return { saved, roomId: archive.destination.checkpoint.manifest.roomId };
      };
    }
  }

  private async compareDraft<T>(
    request: SavedDraft,
    compare: (live: Node, saved: Node, snapshot: CoordinatedRoomSnapshot) => T,
  ): Promise<T> {
    const { saved, roomId } = await this.readDraft(request);
    const current = await this.room.snapshot();
    const checkpoint = current.checkpoint;
    if (current.phase !== 'active' || !isRetainedCheckpoint(checkpoint) || checkpoint.manifest.roomId !== roomId) {
      throw new RetainedRoomError('stale-epoch', 'The handoff destination is no longer the active room.');
    }
    const draft = isRetainedCheckpoint(saved)
      ? await restoreRetainedCheckpoint(saved, this.schema, this.schemaVersion)
      : await restoreLegacyCheckpoint(saved, this.schema, this.schemaVersion, this.legacyProjection);
    try {
      const active = await restoreRetainedCheckpoint(checkpoint, this.schema, this.schemaVersion);
      try {
        return compare(active.baseDocument, draft.baseDocument, { ...current, checkpoint });
      } finally { active.document.destroy(); }
    } finally { draft.document.destroy(); }
  }

  /** Find text or formatting differences with one unambiguous paragraph in each copy. */
  async listChangedParagraphs(request: SavedDraft) {
    return this.compareDraft(request, (live, saved) => {
      const current = indexBlocks(live);
      const paragraphs: { nodeId: string; excerpt: string }[] = [];
      let total = 0;
      for (const [nodeId, draft] of indexBlocks(saved)) {
        const active = current.get(nodeId);
        if (!draft || !active || !isTextParagraph(draft) || !isTextParagraph(active)
          || draft.childCount === active.childCount && draft.content.every((child, index) => child.eq(active.child(index)))) continue;
        total++;
        if (paragraphs.length < 100) paragraphs.push({ nodeId, excerpt: draft.textContent.slice(0, 120) });
      }
      return { paragraphs, total };
    });
  }

  private async loadReview(request: DraftParagraph) {
    const { archiveId, sourceEpoch, draftId, nodeId } = request;
    if (typeof nodeId !== 'string' || !nodeId || nodeId.length > 200) throw new Error('Invalid recovery paragraph ID.');
    return this.compareDraft(request, (active, draft, { checkpoint, epoch, revision }) => {
      const live = paragraph(active, nodeId);
      const saved = paragraph(draft, nodeId);
      const currentParagraph = live.node, draftParagraph = saved.node;
      const currentLocation = paragraphLocation(active, live.path);
      const draftLocation = paragraphLocation(draft, saved.path);
      const review = Object.freeze({ archiveId, ...(sourceEpoch === undefined ? {} : { sourceEpoch }), draftId, nodeId, epoch, revision,
        currentText: currentParagraph.textContent, draftText: draftParagraph.textContent,
        currentParagraph: currentParagraph.toJSON(), draftParagraph: draftParagraph.toJSON(),
        canEditPlainText: plainRun(currentParagraph) && plainRun(draftParagraph), currentLocation: currentLocation.label,
        draftLocation: draftLocation.label, canUseSavedPlacement: Boolean(reviewedMove(active, live, draftLocation)) });
      return { review, checkpoint, draftParagraph, draftLocation };
    });
  }

  async preview(request: DraftParagraph): Promise<RetiredParagraphReview> {
    return (await this.loadReview(request)).review;
  }

  private async writeReview(epoch: string, revision: number, update: Uint8Array, reviewOperation?: DocumentReviewOperation): Promise<CoordinatedRoomSnapshot> {
    const request = { epoch, protocol: 'retained' as const, expectedRevision: revision, update };
    const snapshot = reviewOperation && this.room instanceof CoordinatedDocumentRoom
      ? await this.room.writeReviewed(request, reviewOperation)
      : await this.room.write(request);
    const checkpoint = snapshot.checkpoint;
    if (!isRetainedCheckpoint(checkpoint)) {
      throw new RetainedRoomError('stale-epoch', 'The handoff destination is no longer a retained room.');
    }
    return { ...snapshot, checkpoint };
  }

  /** An operation ID is optional for retained-only hosts. Cross-format hosts
   * can persist it before sending and retry the exact proposal after a lost reply. */
  async apply(review: RetiredParagraphReview, replacement: ParagraphReplacement, operationId?: string): Promise<CoordinatedRoomSnapshot> {
    if (operationId === undefined) return this.applyOnce(review, replacement);
    const repository = this.reviewRepository;
    if (!documentRoomId(operationId) || !repository?.readDocumentReview || !repository.commitDocumentReview) {
      throw new RetainedRoomError('invalid-ticket', 'Durable review requires an operation UUID and an atomic receipt repository.');
    }
    const proposal = structuredClone(replacement);
    const { archiveId, sourceEpoch, draftId, nodeId, epoch, revision, currentText, draftText } = review;
    const proof = { archiveId, ...(sourceEpoch === undefined ? {} : { sourceEpoch }), draftId, nodeId, epoch, revision, currentText, draftText };
    const digest = await checkpointWire.digest(new TextEncoder().encode(checkpointWire.stableJSON({ ...proof, proposal })));
    const replay = async () => {
      const receipt = await repository.readDocumentReview!(this.key, operationId);
      if (!receipt) return;
      if (receipt.digest !== digest || receipt.epoch !== epoch) {
        throw new RetainedRoomError('invalid-ticket', 'This review operation UUID was already used for another proposal.');
      }
      const snapshot = await this.room.snapshot();
      const checkpoint = snapshot.checkpoint;
      if (snapshot.epoch !== epoch || !isRetainedCheckpoint(checkpoint)) {
        throw new RetainedRoomError('stale-epoch', 'The reviewed edit was saved in an earlier room. Reopen the current room before editing.');
      }
      if (snapshot.phase !== 'active') {
        throw new RetainedRoomError('frozen', 'The reviewed edit is saved. Retry when the room is writable.');
      }
      if (snapshot.revision < receipt.revision) {
        throw new RetainedRoomError('revision-conflict', 'The reviewed edit is saved but the room cannot acknowledge it yet.');
      }
      return { ...snapshot, checkpoint };
    };
    const saved = await replay();
    if (saved) return saved;
    try { return await this.applyOnce(proof, proposal, { id: operationId, digest }); }
    catch (error) {
      // A concurrent retry may have won the storage fence.
      const concurrent = await replay();
      if (concurrent) return concurrent;
      throw error;
    }
  }

  private async applyOnce(review: ReviewProof, replacement: ParagraphReplacement, operation?: DocumentReviewOperation) {
    const { archiveId, sourceEpoch, draftId, nodeId, epoch, revision, currentText, draftText } = review;
    const usePlacement = replacement !== null && typeof replacement === 'object' && 'useSavedPlacement' in replacement
      && replacement.useSavedPlacement === true;
    let composed: readonly Node[] | undefined;
    if (typeof replacement === 'string') {
      if (!replacement.trim() || replacement.length > 20_000 || /[\r\n]/.test(replacement)) {
        throw new Error('Enter one nonempty line of at most 20,000 characters.');
      }
    } else if (replacement && typeof replacement === 'object' && 'content' in replacement) {
      composed = composedRuns(this.schema, replacement.content);
    } else if (!usePlacement && (!replacement || typeof replacement !== 'object' || !('useSavedFormatting' in replacement) || replacement.useSavedFormatting !== true)) {
      throw new Error('Choose a reviewed replacement.');
    }
    const { review: verified, checkpoint, draftParagraph, draftLocation } = await this.loadReview({ archiveId, sourceEpoch, draftId, nodeId });
    if (verified.epoch !== epoch || verified.revision !== revision
      || verified.currentText !== currentText || verified.draftText !== draftText) {
      throw new RetainedRoomError('revision-conflict', 'The review is stale. Compare the latest room and saved draft again.');
    }
    if (typeof replacement === 'string' && !verified.canEditPlainText) {
      throw new Error('Manual text requires a single unformatted run in each version. Use the saved paragraph instead.');
    }
    const restored = await restoreRetainedCheckpoint(checkpoint, this.schema, this.schemaVersion);
    try {
      const store = new RetainedDocumentStore(restored.document, restored.manifest.room, this.schema, () => `review-${crypto.randomUUID()}`);
      try {
        const doc = store.read(), target = paragraph(doc, nodeId);
        const state = EditorState.create({ schema: this.schema, doc });
        const basis = Y.encodeStateVector(restored.document);
        if (usePlacement) {
          const move = reviewedMove(doc, target, draftLocation);
          if (!move) throw new Error('The saved location has no unambiguous live destination.');
          const editor = new Editor(state, (_state, transaction) => { store.apply(transaction); });
          const release = registerSharedDirectionIdentity(editor, path => {
            return retainedDirectionIdentity(restored.document, restored.manifest.room,
              restored.manifest.roomId, store.identity(path));
          });
          try {
            if (!moveNode(editor, move)) throw new Error('The saved location is incompatible with the live document.');
          } finally { release(); editor.destroy(); }
          return await this.writeReview(epoch, revision, Y.encodeStateAsUpdate(restored.document, basis), operation);
        }
        const transaction = state.createTransaction();
        if (typeof replacement === 'string') {
          transaction.replaceText([...target.path, 0], 0, currentText.length, replacement);
        } else {
          transaction.replaceNode(target.path, [target.node.copy(composed ?? draftParagraph.content)]);
        }
        if (!transaction.doc.eq(doc)) store.apply(transaction);
        return await this.writeReview(epoch, revision, Y.encodeStateAsUpdate(restored.document, basis), operation);
      } finally { store.destroy(); }
    } finally { restored.document.destroy(); }
  }
}
