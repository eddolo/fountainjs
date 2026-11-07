import * as Y from 'yjs';
import { Editor, EditorState, moveNode, type NodeMove, type Node, type NodeJSON, type Schema } from '../../src/core';
import { registerSharedDirectionIdentity } from '../../src/core/shared-direction';
import { restoreRetainedCheckpoint } from '../../src/yjs/retained-checkpoint';
import { RetainedDocumentStore } from '../../src/yjs/retained-document';
import { RetainedRoomHandoff, type RetainedHandoffRepository } from '../../src/yjs/retained-handoff';
import { CoordinatedRetainedRoom } from '../../src/yjs/retained-room-coordinator';
import { RetainedRoomError } from '../../src/yjs/retained-room-store';
import { assertRetainedWireString } from '../../src/yjs/retained-wire';

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
  readonly currentLocation: string;
  readonly draftLocation: string;
  readonly canUseSavedPlacement: boolean;
}

type ParagraphReplacement = string | { readonly useSavedFormatting: true } | { readonly content: readonly NodeJSON[] }
  | { readonly useSavedPlacement: true };

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

function paragraph(document: Node, nodeId: string) {
  const match = uniqueBlock(document, nodeId);
  if (!match || match.node.type.name !== 'paragraph' || match.node.content.some(child => !child.isText)) {
    throw new Error('Review requires one identifiable text-only paragraph in each document.');
  }
  return match;
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
        const live = paragraph(active.baseDocument, nodeId);
        const saved = paragraph(draft.baseDocument, nodeId);
        const currentParagraph = live.node, draftParagraph = saved.node;
        const currentLocation = paragraphLocation(active.baseDocument, live.path);
        const draftLocation = paragraphLocation(draft.baseDocument, saved.path);
        const review = Object.freeze({ archiveId, draftId, nodeId, epoch: current.epoch, revision: current.revision,
          currentText: currentParagraph.textContent, draftText: draftParagraph.textContent,
          currentParagraph: currentParagraph.toJSON(), draftParagraph: draftParagraph.toJSON(),
          canEditPlainText: plainRun(currentParagraph) && plainRun(draftParagraph), currentLocation: currentLocation.label,
          draftLocation: draftLocation.label, canUseSavedPlacement: Boolean(reviewedMove(active.baseDocument, live, draftLocation)) });
        return { review, snapshot: current, draftParagraph, draftLocation };
      } finally { active.document.destroy(); }
    } finally { draft.document.destroy(); }
  }

  async preview(request: DraftParagraph): Promise<RetiredParagraphReview> {
    return (await this.loadReview(request)).review;
  }

  async apply(review: RetiredParagraphReview, replacement: ParagraphReplacement) {
    const { archiveId, draftId, nodeId, epoch, revision, currentText, draftText } = review;
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
    const { review: verified, snapshot, draftParagraph, draftLocation } = await this.loadReview({ archiveId, draftId, nodeId });
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
        const basis = Y.encodeStateVector(restored.document);
        if (usePlacement) {
          const move = reviewedMove(doc, target, draftLocation);
          if (!move) throw new Error('The saved location has no unambiguous live destination.');
          const editor = new Editor(state, (_state, transaction) => { store.apply(transaction); });
          const release = registerSharedDirectionIdentity(editor, path => {
            const identity = store.identity(path);
            return identity ? `yjs-${identity === 'root' ? restored.manifest.roomId : identity}` : null;
          });
          try {
            if (!moveNode(editor, move)) throw new Error('The saved location is incompatible with the live document.');
          } finally { release(); editor.destroy(); }
          return await this.room.write({ epoch, expectedRevision: revision, update: Y.encodeStateAsUpdate(restored.document, basis) });
        }
        const transaction = state.createTransaction();
        if (typeof replacement === 'string') {
          transaction.replaceText([...target.path, 0], 0, currentText.length, replacement);
        } else {
          transaction.replaceNode(target.path, [target.node.copy(composed ?? draftParagraph.content)]);
        }
        if (transaction.doc.eq(doc)) return snapshot;
        store.apply(transaction);
        return await this.room.write({ epoch, expectedRevision: revision, update: Y.encodeStateAsUpdate(restored.document, basis) });
      } finally { store.destroy(); }
    } finally { restored.document.destroy(); }
  }
}
