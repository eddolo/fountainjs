import * as Y from 'yjs';
import { RangeSelection, Selection, nodeRangeAtPath, resolveDocumentPoint, selectionAtPosition, textPointToPosition, type AnySelection, type Node, type NodeJSON, type Schema } from '../core';
import { validateRetainedDocument } from './retained-document';
import { YjsStructuredAttributeStore, type YjsStructuredAttributesOptions } from './structured-attributes';

export type LegacyStructuredOptions = Omit<YjsStructuredAttributesOptions, 'map'>;
const safeName = (name: string): boolean => /^[a-z_][\w.-]{0,127}$/i.test(name) && !['__proto__', 'prototype', 'constructor'].includes(name);
const element = (value: unknown): value is Y.XmlElement => value instanceof Y.XmlElement && value.nodeName === 'fountain-node';
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
    if (!(fragment instanceof Y.XmlFragment) || fragment.constructor !== Y.XmlFragment || fragment.length !== 1 || !element(fragment.get(0))) throw new Error('Legacy checkpoint requires exactly one declared XML document root.');
    this.fragment = fragment;
    this.root = fragment.get(0) as Y.XmlElement;
    let nodes = 0, characters = 0;
    const read = (node: Y.XmlElement, path: readonly number[], depth: number): NodeJSON => {
      if (++nodes > 100_000 || depth > 100) throw new Error('Legacy document exceeds node/depth bounds.');
      this.paths.set(node, Object.freeze([...path]));
      const reference = Y.createRelativePositionFromTypeIndex(node, 0).type;
      if (!reference) throw new Error('Legacy node has no stable shared identity.');
      this.identities.set(`yjs-${reference.client}-${reference.clock}`, Object.freeze([...path]));
      const metadata = node.getAttributes(), type = metadata['fountain:type'], attrs: Record<string, unknown> = {}; let marks: NodeJSON['marks'];
      if (typeof type !== 'string' || !type || Object.keys(metadata).length > 1_000) throw new Error('Invalid legacy node metadata.');
      for (const [name, value] of Object.entries(metadata)) {
        if (name === 'fountain:type') continue;
        if (typeof value !== 'string' || value.length > 1_000_000) throw new Error('Invalid legacy encoded metadata.');
        if (name === 'fountain:marks') { const decoded = JSON.parse(value); if (!Array.isArray(decoded)) throw new Error('Invalid legacy marks.'); marks = decoded; }
        else if (name.startsWith('fountain:attr:') && safeName(name.slice(14))) attrs[name.slice(14)] = JSON.parse(value);
        else throw new Error(`Unknown legacy node metadata: ${name}`);
      }
      const children = node.toArray();
      if (type === 'text') {
        // The public decoder ignores text attributes and XmlText formatting.
        // Refuse them rather than silently interpreting or discarding them.
        if (Object.keys(attrs).length || children.length !== 1 || !(children[0] instanceof Y.XmlText)) throw new Error('Unsupported legacy text structure or attributes.');
        const text = children[0], runs = text.toDelta();
        if (Object.keys(text.getAttributes()).length || runs.some((run: any) => typeof run.insert !== 'string' || run.attributes && Object.keys(run.attributes).length)) throw new Error('Unsupported legacy XmlText formatting or embeds.');
        const value = text.toString(); characters += value.length;
        if (characters > 10_000_000) throw new Error('Legacy text exceeds its character bound.');
        this.paths.set(text, Object.freeze([...path])); return { type, text: value, ...(marks?.length ? { marks } : {}) };
      }
      return { type, ...(Object.keys(attrs).length ? { attrs } : {}), ...(marks?.length ? { marks } : {}), ...(children.length ? { content: children.map((child, index) => { if (!element(child)) throw new Error('Invalid legacy child.'); return read(child, [...path, index], depth + 1); }) } : {}) };
    };
    const raw = read(this.root, [], 0), base = schema.nodeFromJSON(raw);
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
