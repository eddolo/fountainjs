import * as Y from 'yjs';
import { RangeSelection, Selection, nodeRangeAtPath, resolveDocumentPoint, selectionAtPosition, textPointToPosition, type AnySelection, type Node, type NodeJSON, type Schema } from '../core';
import { validateRetainedDocument } from './retained-document';
import { legacyNodeIdentity } from './legacy-node-identity';
import { isSharedElement, readLegacyXmlRoot } from './legacy-xml';
import { YjsStructuredAttributeStore, type YjsStructuredAttributesOptions } from './structured-attributes';

export type LegacyStructuredOptions = Omit<YjsStructuredAttributesOptions, 'map'>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Strict, read-only decoder for the public adapter's existing XML wire format.
 * No adapter connection, root repair, initial seeding or canonical rewriting. */
export class LegacyDocumentReader {
  readonly document: Node;
  readonly paths = new Map<Y.AbstractType<any>, readonly number[]>();
  readonly identities = new Map<string, readonly number[]>();
  readonly fragment: Y.XmlFragment;
  readonly root: Y.XmlElement;
  constructor(readonly source: Y.Doc, readonly room: string, readonly schema: Schema, structured?: LegacyStructuredOptions, selectedFragment?: Y.XmlFragment) {
    const fragment = selectedFragment ?? source.share.get(room);
    if (!(fragment instanceof Y.XmlFragment) || fragment.constructor !== Y.XmlFragment || fragment.length !== 1 || !isSharedElement(fragment.get(0))) throw new Error('Legacy checkpoint requires exactly one declared XML document root.');
    this.fragment = fragment;
    this.root = fragment.get(0) as Y.XmlElement;
    const raw = readLegacyXmlRoot(this.root, (item, path) => {
      this.paths.set(item, Object.freeze([...path]));
      if (isSharedElement(item)) this.identities.set(legacyNodeIdentity(item), Object.freeze([...path]));
    });
    const base = schema.nodeFromJSON(raw);
    if (base.type !== schema.topNodeType) throw new Error('Legacy root is not the schema document.');
    // Schema factories may add defaults, but cannot drop/rewrite supplied data.
    const preserve = (before: NodeJSON, after: Node): void => {
      if (before.type !== after.type.name || before.text !== after.text || (before.content?.length ?? 0) !== after.childCount
        || Object.entries(before.attrs ?? {}).some(([key, value]) => !same(after.attrs[key], value))
        || !same(before.marks ?? [], after.marks.map(mark => mark.toJSON()))) throw new Error('Schema changes supplied legacy content.');
      before.content?.forEach((child, index) => preserve(child, after.child(index)));
    };
    preserve(raw, base); validateRetainedDocument(base, schema);
    const defaultStructured = `${room}:structured-attributes`;
    if (!structured && source.share.has(defaultStructured)) throw new Error('Legacy structured attributes require their explicit definitions.');
    if (structured) {
      const name = structured.mapName ?? defaultStructured;
      if (!(source.share.get(name) instanceof Y.Map)) throw new Error('Legacy structured attributes require their declared source map.');
      const store = new YjsStructuredAttributeStore(source, structured, defaultStructured);
      this.document = schema.nodeFromJSON(store.overlay(base)); validateRetainedDocument(this.document, schema);
    } else this.document = base;
  }

  point(raw: unknown): { path: readonly number[]; index: number; type: Y.AbstractType<any>; association: -1 | 1 } {
    const relative = Y.createRelativePositionFromJSON(raw as any), absolute = Y.createAbsolutePositionFromRelativePosition(relative, this.source), path = absolute && this.paths.get(absolute.type);
    if (!absolute || !path) throw new Error('Detached or unsupported legacy relative position.');
    return { path, index: absolute.index, type: absolute.type, association: relative.assoc < 0 ? -1 : 1 };
  }
  textAnchor(raw: unknown): { path: readonly number[]; offset: number; association: -1 | 1 } {
    const point = this.point(raw);
    if (!(point.type instanceof Y.XmlText)) throw new Error('Legacy anchor is not text.');
    const node = point.path.reduce((node, index) => node.child(index), this.document);
    if (!node.isText || point.index < 0 || point.index > node.text!.length) throw new Error('Legacy anchor is outside its text.');
    return { path: point.path, offset: point.index, association: point.association };
  }
  selection(raw: unknown): AnySelection {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid legacy selection.');
    const value = raw as { kind?: unknown; association?: unknown; anchor: unknown; head: unknown };
    if (Object.keys(raw).some(key => !['kind', 'association', 'anchor', 'head'].includes(key)) || value.kind !== undefined && value.kind !== 'range') throw new Error('Unsupported legacy selection fields.');
    const anchor = this.point(value.anchor), head = this.point(value.head);
    if (value.kind === undefined) {
      const start = this.textAnchor(value.anchor), end = this.textAnchor(value.head), a = textPointToPosition(this.document, start.path, start.offset), b = textPointToPosition(this.document, end.path, end.offset);
      return a <= b ? Selection.range(start.path, start.offset, end.path, end.offset) : Selection.range(end.path, end.offset, start.path, start.offset);
    }
    const association = value.association ?? 1; if (association !== -1 && association !== 1) throw new Error('Invalid legacy selection association.');
    const position = (point: ReturnType<LegacyDocumentReader['point']>): number => {
      if (point.type instanceof Y.XmlText) return textPointToPosition(this.document, point.path, point.index);
      const parent = point.path.reduce((node, index) => node.child(index), this.document);
      if (point.index < 0 || point.index > parent.childCount) throw new Error('Invalid legacy child boundary.');
      let result = point.path.length ? nodeRangeAtPath(this.document, point.path).from + 1 : 0;
      for (let index = 0; index < point.index; index++) result += parent.child(index).nodeSize;
      resolveDocumentPoint(this.document, result, association); return result;
    };
    const from = position(anchor), to = position(head); return from === to ? selectionAtPosition(this.document, from, association) : new RangeSelection(this.document, from, to);
  }
}
