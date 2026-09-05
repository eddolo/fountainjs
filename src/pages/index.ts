import {
  NodeSelection,
  Selection,
  insertNode,
  type Editor,
  type Node,
  type NodeSpec,
} from '../core';
import { getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from '../extensions/extension';
import {
  assertPageTemplates,
  insertPageField,
  inspectPageTemplates,
  pageFieldNode,
  pageFooterNode,
  pageHeaderNode,
  removePageTemplate,
  selectPageTemplate,
  setPageTemplate,
} from './templates';

export * from './layout';
export * from './presentation';
export * from './templates';

const FOOTNOTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validFootnoteId(value: unknown): value is string {
  return typeof value === 'string' && FOOTNOTE_ID.test(value);
}

function footnoteAnchor(id: unknown): string {
  return `fountain-footnote-${String(id)}`;
}

export const pageBreakNode: NodeSpec = {
  group: 'block',
  atom: true,
  parseDOM: [{ tag: 'hr[data-fountain-page-break="true"]' }],
  toDOM: () => ['hr', {
    'data-fountain-page-break': 'true',
    className: 'fountain-page-break',
    role: 'separator',
    'aria-label': 'Page break',
  }],
  toText: () => '\f',
};

export const footnoteReferenceNode: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { id: { validate: validFootnoteId } },
  parseDOM: [{
    tag: 'sup[data-fountain-footnote-reference]',
    getAttrs: (element) => ({ id: element.dataset.fountainFootnoteReference ?? '' }),
  }],
  toDOM: (node) => ['sup', {
    'data-fountain-footnote-reference': node.attrs.id,
    className: 'fountain-footnote-reference',
    role: 'doc-noteref',
  }, ['a', { href: `#${footnoteAnchor(node.attrs.id)}` }, String(node.attrs.id)]],
  toText: (node) => `[^${String(node.attrs.id)}]`,
};

export const footnoteDefinitionNode: NodeSpec = {
  group: 'block',
  content: 'block+',
  attrs: { id: { validate: validFootnoteId } },
  parseDOM: [{
    tag: 'section[data-fountain-footnote-definition]',
    getAttrs: (element) => ({ id: element.dataset.fountainFootnoteDefinition ?? '' }),
  }],
  toDOM: (node) => ['section', {
    'data-fountain-footnote-definition': node.attrs.id,
    className: 'fountain-footnote-definition',
    id: footnoteAnchor(node.attrs.id),
    role: 'doc-footnote',
  }, 0],
  toText: (node) => node.content.map((child) => child.textContent).join('\n'),
};

export interface FootnoteOccurrence {
  readonly id: string;
  readonly path: readonly number[];
}

export type FootnoteIssueCode =
  | 'duplicate-definition'
  | 'missing-definition'
  | 'nested-definition'
  | 'unreferenced-definition';

export interface FootnoteIssue {
  readonly code: FootnoteIssueCode;
  readonly id: string;
  readonly path: readonly number[];
  readonly detail: string;
}

export interface FootnoteReport {
  readonly references: readonly FootnoteOccurrence[];
  readonly definitions: readonly FootnoteOccurrence[];
  readonly issues: readonly FootnoteIssue[];
  readonly valid: boolean;
}

function occurrence(node: Node, path: readonly number[]): FootnoteOccurrence {
  return Object.freeze({ id: String(node.attrs.id), path: Object.freeze([...path]) });
}

/** Audits portable footnote identity without reading the DOM or changing the document. */
export function inspectFootnotes(document: Node): FootnoteReport {
  const references: FootnoteOccurrence[] = [];
  const definitions: FootnoteOccurrence[] = [];
  document.descendants((node, path) => {
    if (node.type.name === 'footnote_reference') references.push(occurrence(node, path));
    if (node.type.name === 'footnote_definition') definitions.push(occurrence(node, path));
  });

  const definitionIds = new Map<string, FootnoteOccurrence[]>();
  definitions.forEach((entry) => definitionIds.set(entry.id, [...(definitionIds.get(entry.id) ?? []), entry]));
  const referencedIds = new Set(references.map((entry) => entry.id));
  const issues: FootnoteIssue[] = [];
  definitions.forEach((entry) => {
    if (entry.path.length !== 1) issues.push(Object.freeze({
      code: 'nested-definition', id: entry.id, path: entry.path,
      detail: `Footnote definition ${entry.id} must be a top-level document block.`,
    }));
    if ((definitionIds.get(entry.id)?.length ?? 0) > 1) issues.push(Object.freeze({
      code: 'duplicate-definition', id: entry.id, path: entry.path,
      detail: `Footnote ${entry.id} has more than one definition.`,
    }));
    if (!referencedIds.has(entry.id)) issues.push(Object.freeze({
      code: 'unreferenced-definition', id: entry.id, path: entry.path,
      detail: `Footnote definition ${entry.id} has no reference.`,
    }));
  });
  references.forEach((entry) => {
    if (!definitionIds.has(entry.id)) issues.push(Object.freeze({
      code: 'missing-definition', id: entry.id, path: entry.path,
      detail: `Footnote reference ${entry.id} has no definition.`,
    }));
  });

  return Object.freeze({
    references: Object.freeze(references),
    definitions: Object.freeze(definitions),
    issues: Object.freeze(issues),
    valid: issues.length === 0,
  });
}

export function assertFootnotes(document: Node): void {
  const report = inspectFootnotes(document);
  if (!report.valid) throw new Error(report.issues.map((issue) => issue.detail).join(' '));
}

export interface InsertFootnoteOptions {
  readonly id?: string;
  readonly content?: string | readonly Node[];
}

export interface PagesExtensionOptions {
  /** Supplies collision-resistant portable IDs. Defaults to `crypto.randomUUID`. */
  readonly footnoteIdFactory?: (editor: Editor) => string;
}

function defaultFootnoteId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Footnote insertion requires crypto.randomUUID or an explicit id.');
  }
  return globalThis.crypto.randomUUID();
}

function uniqueFootnoteId(editor: Editor, supplied: string | undefined, factory: (editor: Editor) => string): string | null {
  const report = inspectFootnotes(editor.state.doc);
  const occupied = new Set([
    ...report.references,
    ...report.definitions,
  ].map((entry) => entry.id));
  if (supplied !== undefined) return validFootnoteId(supplied) && !occupied.has(supplied) ? supplied : null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = factory(editor);
    if (!validFootnoteId(candidate)) throw new TypeError('footnoteIdFactory must return a valid 1-128 character portable id.');
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error('footnoteIdFactory returned an occupied id ten times.');
}

function footnoteContent(editor: Editor, value: InsertFootnoteOptions['content']): readonly Node[] | null {
  if (typeof value === 'string' || value === undefined) {
    const paragraph = editor.state.schema.nodes.paragraph;
    return paragraph ? Object.freeze([paragraph.create({}, [editor.state.schema.text(value ?? '')])]) : null;
  }
  if (!Array.isArray(value) || !value.length) return null;
  if (value.some((node) => node.type.schema !== editor.state.schema || !node.isBlock || node.type.name === 'footnote_definition')) return null;
  return Object.freeze([...value]);
}

/** Inserts a persisted manual page break after the current top-level block. */
export function insertPageBreak(editor: Editor): boolean {
  const type = editor.state.schema.nodes.page_break;
  if (!type) return false;
  try { return insertNode(editor, type.create()); }
  catch { return false; }
}

function insertFootnoteWithFactory(
  editor: Editor,
  options: InsertFootnoteOptions,
  idFactory: (editor: Editor) => string,
): boolean {
  if (!editor.editable || !(editor.state.selection instanceof Selection) || !editor.state.selection.isSingleText) return false;
  const referenceType = editor.state.schema.nodes.footnote_reference;
  const definitionType = editor.state.schema.nodes.footnote_definition;
  const content = footnoteContent(editor, options.content);
  const id = uniqueFootnoteId(editor, options.id, idFactory);
  if (!referenceType || !definitionType || !content || !id) return false;

  const selection = editor.state.selection;
  let target: Node;
  try { target = getNodeAtPath(editor.state.doc, selection.path); }
  catch { return false; }
  if (!target.isText) return false;
  const text = target.text ?? '';
  const before = text.slice(0, selection.from);
  const after = text.slice(selection.to);
  const reference = referenceType.create({ id });
  const definition = definitionType.create({ id }, content);
  const inlineIndex = selection.path.at(-1) as number;
  const referencePath = [...selection.path.slice(0, -1), inlineIndex + (before ? 1 : 0)];
  try {
    const transaction = editor.state.createTransaction().replaceNode(selection.path, [
      ...(before ? [target.withText(before)] : []),
      reference,
      target.withText(after),
    ]);
    transaction.replace(transaction.doc.childCount, transaction.doc.childCount, [definition]);
    transaction.setSelection(new NodeSelection(transaction.doc, referencePath));
    editor.state.schema.validate(transaction.doc);
    assertFootnotes(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

/** Inserts an inline reference and its top-level definition in one transaction. */
export function insertFootnote(editor: Editor, options: InsertFootnoteOptions = {}): boolean {
  return insertFootnoteWithFactory(editor, options, () => defaultFootnoteId());
}

/** Selects the first editable text position in a footnote definition. */
export function selectFootnoteDefinition(editor: Editor, id: string): boolean {
  if (!validFootnoteId(id)) return false;
  const definition = inspectFootnotes(editor.state.doc).definitions.find((entry) => entry.id === id);
  if (!definition) return false;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, definition.path); }
  catch { return false; }
  const leaf = getTextLeaves(node)[0];
  if (!leaf) return false;
  try {
    return editor.dispatch(editor.state.createTransaction().setSelection(
      Selection.cursor([...definition.path, ...leaf.path], 0),
    ));
  } catch { return false; }
}

function comparePathDescending(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right[index] ?? -1) - (left[index] ?? -1);
    if (difference) return difference;
  }
  return 0;
}

/** Removes every reference and the definition for one footnote atomically. */
export function removeFootnote(editor: Editor, id: string): boolean {
  if (!editor.editable || !validFootnoteId(id)) return false;
  const report = inspectFootnotes(editor.state.doc);
  const paths = [
    ...report.references.filter((entry) => entry.id === id),
    ...report.definitions.filter((entry) => entry.id === id),
  ].map((entry) => entry.path).sort(comparePathDescending);
  if (!paths.length) return false;
  try {
    const transaction = editor.state.createTransaction();
    paths.forEach((path) => transaction.replaceNode(path, []));
    editor.state.schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

/** Creates the optional portable page-intent extension. Automatic page boundaries are never persisted. */
export function createPagesExtension(options: PagesExtensionOptions = {}): FountainExtension {
  const idFactory = options.footnoteIdFactory ?? (() => defaultFootnoteId());
  return defineExtension({
    name: 'pages',
    nodes: {
      page_break: pageBreakNode,
      footnote_reference: footnoteReferenceNode,
      footnote_definition: footnoteDefinitionNode,
      page_header: pageHeaderNode,
      page_footer: pageFooterNode,
      page_field: pageFieldNode,
    },
    commands: {
      insertPageBreak,
      insertFootnote: (editor, insertOptions: InsertFootnoteOptions = {}) => insertFootnoteWithFactory(editor, insertOptions, idFactory),
      selectFootnoteDefinition,
      removeFootnote,
      setPageTemplate,
      removePageTemplate,
      selectPageTemplate,
      insertPageField,
    },
    services: {
      pages: Object.freeze({ inspectFootnotes, assertFootnotes, inspectPageTemplates, assertPageTemplates }),
    },
  });
}

export const PagesExtension = createPagesExtension();
