import {
  Selection,
  type Editor,
  type Node,
  type NodeSpec,
} from '../core';
import { getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import { insertInlineAtom } from '../extensions/inline-atom';

export type PageTemplateKind = 'header' | 'footer';
export type PageTemplateVariant = 'default' | 'first' | 'odd' | 'even';
export type PageFieldKind = 'page-number' | 'page-count';

const PAGE_TEMPLATE_VARIANTS: readonly PageTemplateVariant[] = Object.freeze(['default', 'first', 'odd', 'even']);
const PAGE_FIELD_KINDS: readonly PageFieldKind[] = Object.freeze(['page-number', 'page-count']);

function validTemplateVariant(value: unknown): value is PageTemplateVariant {
  return typeof value === 'string' && PAGE_TEMPLATE_VARIANTS.includes(value as PageTemplateVariant);
}

function validPageFieldKind(value: unknown): value is PageFieldKind {
  return typeof value === 'string' && PAGE_FIELD_KINDS.includes(value as PageFieldKind);
}

function templateNodeName(kind: PageTemplateKind): 'page_header' | 'page_footer' {
  return kind === 'header' ? 'page_header' : 'page_footer';
}

function templateKind(node: Node): PageTemplateKind | null {
  if (node.type.name === 'page_header') return 'header';
  if (node.type.name === 'page_footer') return 'footer';
  return null;
}

function pageTemplateNode(kind: PageTemplateKind): NodeSpec {
  const element = kind === 'header' ? 'header' : 'footer';
  const attribute = `data-fountain-page-${kind}`;
  return {
    group: 'block',
    content: 'block+',
    attrs: { variant: { default: 'default', validate: validTemplateVariant } },
    parseDOM: [{
      tag: `${element}[${attribute}]`,
      getAttrs: (dom) => ({ variant: dom.getAttribute(attribute) || 'default' }),
    }],
    toDOM: (node) => [element, {
      [attribute]: node.attrs.variant,
      className: `fountain-page-${kind}`,
      role: 'group',
      'aria-label': `${kind === 'header' ? 'Header' : 'Footer'} template (${String(node.attrs.variant)})`,
    }, 0],
    toText: (node) => node.content.map((child) => child.textContent).join('\n'),
  };
}

export const pageHeaderNode: NodeSpec = pageTemplateNode('header');
export const pageFooterNode: NodeSpec = pageTemplateNode('footer');

export const pageFieldNode: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { kind: { default: 'page-number', validate: validPageFieldKind } },
  parseDOM: [{
    tag: 'span[data-fountain-page-field]',
    getAttrs: (dom) => ({ kind: dom.dataset.fountainPageField ?? '' }),
  }],
  toDOM: (node) => {
    const kind = node.attrs.kind as PageFieldKind;
    return ['span', {
      'data-fountain-page-field': kind,
      className: 'fountain-page-field',
      'aria-label': kind === 'page-count' ? 'Total page count' : 'Current page number',
    }, kind === 'page-count' ? '{pages}' : '{page}'];
  },
  toText: (node) => node.attrs.kind === 'page-count' ? '{pages}' : '{page}',
};

export interface PageTemplateOccurrence {
  readonly kind: PageTemplateKind;
  readonly variant: PageTemplateVariant;
  readonly path: readonly number[];
}

export interface PageFieldOccurrence {
  readonly kind: PageFieldKind;
  readonly path: readonly number[];
}

export type PageTemplateIssueCode =
  | 'duplicate-template'
  | 'nested-template'
  | 'orphan-page-field';

export interface PageTemplateIssue {
  readonly code: PageTemplateIssueCode;
  readonly path: readonly number[];
  readonly detail: string;
}

export interface PageTemplateReport {
  readonly templates: readonly PageTemplateOccurrence[];
  readonly fields: readonly PageFieldOccurrence[];
  readonly issues: readonly PageTemplateIssue[];
  readonly valid: boolean;
}

function frozenPath(path: readonly number[]): readonly number[] {
  return Object.freeze([...path]);
}

/** Audits canonical header/footer templates and dynamic fields without reading a renderer. */
export function inspectPageTemplates(document: Node): PageTemplateReport {
  const templates: PageTemplateOccurrence[] = [];
  const fields: PageFieldOccurrence[] = [];
  const issues: PageTemplateIssue[] = [];
  document.descendants((node, path) => {
    const kind = templateKind(node);
    if (kind) {
      const entry = Object.freeze({
        kind,
        variant: node.attrs.variant as PageTemplateVariant,
        path: frozenPath(path),
      });
      templates.push(entry);
      if (path.length !== 1) issues.push(Object.freeze({
        code: 'nested-template',
        path: entry.path,
        detail: `Page ${kind} template ${entry.variant} must be a top-level document block.`,
      }));
    }
    if (node.type.name === 'page_field') fields.push(Object.freeze({
      kind: node.attrs.kind as PageFieldKind,
      path: frozenPath(path),
    }));
  });

  const byIdentity = new Map<string, PageTemplateOccurrence[]>();
  templates.forEach((entry) => {
    const key = `${entry.kind}:${entry.variant}`;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), entry]);
  });
  byIdentity.forEach((entries) => {
    if (entries.length < 2) return;
    entries.forEach((entry) => issues.push(Object.freeze({
      code: 'duplicate-template',
      path: entry.path,
      detail: `Page ${entry.kind} template ${entry.variant} is defined more than once.`,
    })));
  });
  fields.forEach((field) => {
    const topLevelIndex = field.path[0];
    const owner = topLevelIndex === undefined ? null : document.content[topLevelIndex];
    if (!owner || !templateKind(owner)) issues.push(Object.freeze({
      code: 'orphan-page-field',
      path: field.path,
      detail: `Dynamic ${field.kind} fields may only appear inside a page header or footer template.`,
    }));
  });

  return Object.freeze({
    templates: Object.freeze(templates),
    fields: Object.freeze(fields),
    issues: Object.freeze(issues),
    valid: issues.length === 0,
  });
}

export function assertPageTemplates(document: Node): void {
  const report = inspectPageTemplates(document);
  if (!report.valid) throw new Error(report.issues.map((issue) => issue.detail).join(' '));
}

export interface SetPageTemplateOptions {
  readonly kind: PageTemplateKind;
  readonly variant?: PageTemplateVariant;
  readonly content?: string | readonly Node[];
}

function templateContent(editor: Editor, value: SetPageTemplateOptions['content']): readonly Node[] | null {
  if (typeof value === 'string' || value === undefined) {
    const paragraph = editor.state.schema.nodes.paragraph;
    return paragraph ? Object.freeze([paragraph.create({}, [editor.state.schema.text(value ?? '')])]) : null;
  }
  if (!Array.isArray(value) || !value.length) return null;
  if (value.some((node) => (
    node.type.schema !== editor.state.schema
    || !node.isBlock
    || node.type.name === 'page_header'
    || node.type.name === 'page_footer'
    || node.type.name === 'footnote_definition'
  ))) return null;
  return Object.freeze([...value]);
}

function templateInsertIndex(document: Node, kind: PageTemplateKind): number {
  if (kind === 'header') {
    let index = 0;
    while (document.content[index]?.type.name === 'page_header') index += 1;
    return index;
  }
  const firstDefinition = document.content.findIndex((node) => node.type.name === 'footnote_definition');
  return firstDefinition < 0 ? document.childCount : firstDefinition;
}

/** Creates or replaces one canonical header/footer template. Repetition remains renderer-owned. */
export function setPageTemplate(editor: Editor, options: SetPageTemplateOptions): boolean {
  if (!editor.editable || !options || !['header', 'footer'].includes(options.kind)) return false;
  const variant = options.variant ?? 'default';
  if (!validTemplateVariant(variant)) return false;
  const type = editor.state.schema.nodes[templateNodeName(options.kind)];
  const content = templateContent(editor, options.content);
  if (!type || !content) return false;
  const existing = inspectPageTemplates(editor.state.doc).templates.find((entry) => (
    entry.kind === options.kind && entry.variant === variant
  ));
  try {
    const node = type.create({ variant }, content);
    const transaction = editor.state.createTransaction();
    if (existing) transaction.replaceNode(existing.path, [node]);
    else {
      const index = templateInsertIndex(transaction.doc, options.kind);
      transaction.replace(index, index, [node]);
    }
    editor.state.schema.validate(transaction.doc);
    assertPageTemplates(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

/** Removes one canonical header/footer template and all fields contained by it. */
export function removePageTemplate(
  editor: Editor,
  kind: PageTemplateKind,
  variant: PageTemplateVariant = 'default',
): boolean {
  if (!editor.editable || !validTemplateVariant(variant)) return false;
  const entry = inspectPageTemplates(editor.state.doc).templates.find((candidate) => (
    candidate.kind === kind && candidate.variant === variant
  ));
  if (!entry) return false;
  try {
    const transaction = editor.state.createTransaction().replaceNode(entry.path, []);
    editor.state.schema.validate(transaction.doc);
    assertPageTemplates(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

/** Selects the first editable text position in a canonical page template. */
export function selectPageTemplate(
  editor: Editor,
  kind: PageTemplateKind,
  variant: PageTemplateVariant = 'default',
): boolean {
  if (!validTemplateVariant(variant)) return false;
  const entry = inspectPageTemplates(editor.state.doc).templates.find((candidate) => (
    candidate.kind === kind && candidate.variant === variant
  ));
  if (!entry) return false;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, entry.path); }
  catch { return false; }
  const leaf = getTextLeaves(node)[0];
  if (!leaf) return false;
  try {
    return editor.dispatch(editor.state.createTransaction().setSelection(
      Selection.cursor([...entry.path, ...leaf.path], 0),
    ));
  } catch { return false; }
}

/** Inserts a portable current-page or total-page-count field inside a template. */
export function insertPageField(editor: Editor, kind: PageFieldKind): boolean {
  if (!validPageFieldKind(kind) || !(editor.state.selection instanceof Selection)) return false;
  const topLevelIndex = editor.state.selection.path[0];
  const owner = topLevelIndex === undefined ? null : editor.state.doc.content[topLevelIndex];
  if (!owner || !templateKind(owner)) return false;
  const type = editor.state.schema.nodes.page_field;
  if (!type) return false;
  return insertInlineAtom(editor, type.create({ kind }), undefined, '', true);
}

/** Resolves the displayed value for a page field in a renderer or print projection. */
export function resolvePageField(kind: PageFieldKind, pageNumber: number, pageCount: number): string {
  if (!validPageFieldKind(kind)) throw new TypeError('Unknown page field kind.');
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new TypeError('pageNumber must be a positive safe integer.');
  if (!Number.isSafeInteger(pageCount) || pageCount < pageNumber) {
    throw new TypeError('pageCount must be a safe integer greater than or equal to pageNumber.');
  }
  return String(kind === 'page-count' ? pageCount : pageNumber);
}
