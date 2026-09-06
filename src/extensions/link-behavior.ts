import {
  Node,
  Plugin,
  Selection,
  isSafeURL,
  setLink,
  unsetLink,
  type Attributes,
  type Editor,
  type Mark,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from './extension';

const AUTOLINK_CANDIDATE = /^(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i;

export type LinkSource = 'manual' | 'autolink' | 'paste';

export interface LinkValidationContext {
  readonly source: LinkSource;
  readonly original: string;
}

export interface LinkBehaviorOptions {
  readonly autolink?: boolean;
  readonly linkOnPaste?: boolean;
  readonly defaultTarget?: '_blank' | '_self';
  readonly normalize?: (value: string, context: LinkValidationContext) => string | null;
  readonly validate?: (href: string, context: LinkValidationContext) => boolean;
  readonly onActivate?: (link: ActiveLink, event: MouseEvent) => void;
}

export interface ActiveLink {
  readonly href: string;
  readonly title: string;
  readonly target: '_blank' | '_self';
  readonly text: string;
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
}

export interface LinkEditAttributes {
  readonly title?: string;
  readonly target?: '_blank' | '_self';
  /** Text inserted when creating a link at an empty caret. Defaults to the URL. */
  readonly text?: string;
}

function defaultNormalize(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048 || trimmed.includes('\0')) return null;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(trimmed)) return `mailto:${trimmed}`;
  return isSafeURL(trimmed) ? trimmed : null;
}

export function normalizeLinkURL(
  value: string,
  options: LinkBehaviorOptions = {},
  source: LinkSource = 'manual',
): string | null {
  const context = Object.freeze({ source, original: value });
  const normalized = options.normalize ? options.normalize(value, context) : defaultNormalize(value);
  if (typeof normalized !== 'string') return null;
  const safe = defaultNormalize(normalized);
  if (!safe || options.validate?.(safe, context) === false) return null;
  return safe;
}

function linkIn(node: Node): Mark | undefined {
  return node.marks.find((mark) => mark.type.name === 'link');
}

/** Returns the complete contiguous link surrounding the caret or selection start. */
export function getActiveLink(editor: Editor): ActiveLink | null {
  const selection = editor.state.selection;
  if (selection.kind !== 'text') return null;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, selection.path); }
  catch { return null; }
  const active = linkIn(node);
  if (!node.isText || !active) return null;
  const parentPath = selection.path.slice(0, -1);
  const parent = getNodeAtPath(editor.state.doc, parentPath);
  const index = selection.path.at(-1) as number;
  let start = index;
  let end = index;
  while (start > 0 && linkIn(parent.child(start - 1))?.eq(active)) start -= 1;
  while (end + 1 < parent.childCount && linkIn(parent.child(end + 1))?.eq(active)) end += 1;
  return Object.freeze({
    href: String(active.attrs.href),
    title: String(active.attrs.title ?? ''),
    target: active.attrs.target === '_self' ? '_self' : '_blank',
    text: parent.content.slice(start, end + 1).map((child) => child.textContent).join(''),
    path: Object.freeze([...parentPath, start]),
    from: start,
    to: end,
  });
}

function rewriteActiveLink(editor: Editor, href: string | null, attrs: Omit<Attributes, 'href'> = {}): boolean {
  const active = getActiveLink(editor);
  const selection = editor.state.selection;
  if (!active || selection.kind !== 'text') return false;
  const parentPath = active.path.slice(0, -1);
  const parent = getNodeAtPath(editor.state.doc, parentPath);
  const linkType = editor.state.schema.marks.link;
  if (!linkType) return false;
  let replacement: Mark | undefined;
  try {
    if (href) replacement = linkType.create({
      href,
      title: String(attrs.title ?? active.title),
      target: attrs.target === '_self' ? '_self' : '_blank',
    });
  } catch { return false; }
  const content = parent.content.map((child, index) => {
    if (!child.isText || index < active.from || index > active.to) return child;
    return child.withMarks([
      ...child.marks.filter((mark) => mark.type.name !== 'link'),
      ...(replacement ? [replacement] : []),
    ]);
  });
  const transaction = editor.state.createTransaction().replaceNode(parentPath, [parent.copy(content)]);
  transaction.setSelection(new Selection(selection.path, selection.from, selection.to, selection.endPath));
  editor.dispatch(transaction);
  return true;
}

/** Applies a link to a selection or edits the whole link surrounding a caret. */
export function editLink(
  editor: Editor,
  value: string,
  attrs: LinkEditAttributes = {},
  options: LinkBehaviorOptions = {},
): boolean {
  const href = normalizeLinkURL(value, options, 'manual');
  if (!href) return false;
  const markAttrs = { title: attrs.title ?? '', target: attrs.target ?? '_blank' };
  if (!editor.state.selection.isCollapsed) return setLink(editor, href, markAttrs);
  if (getActiveLink(editor)) return rewriteActiveLink(editor, href, markAttrs);
  return insertLinkAtCaret(editor, href, attrs.text?.trim() || href, attrs);
}

/** Removes a selected link or the complete link surrounding a caret. */
export function removeLink(editor: Editor): boolean {
  return editor.state.selection.isCollapsed ? rewriteActiveLink(editor, null) : unsetLink(editor);
}

function splitLinkedText(
  target: Node,
  from: number,
  to: number,
  display: string,
  link: Mark,
): { nodes: Node[]; cursorIndex: number; cursorOffset: number } {
  const value = target.text ?? '';
  const before = value.slice(0, from);
  const after = value.slice(to);
  const nodes = [
    ...(before ? [target.withText(before)] : []),
    target.withText(display).withMarks([...target.marks.filter((mark) => mark.type.name !== 'link'), link]),
    ...(after ? [target.withText(after)] : []),
  ];
  const linkedIndex = before ? 1 : 0;
  return {
    nodes,
    cursorIndex: linkedIndex,
    cursorOffset: display.length,
  };
}

function insertLinkAtCaret(
  editor: Editor,
  href: string,
  display: string,
  attrs: LinkEditAttributes = {},
): boolean {
  const selection = editor.state.selection;
  if (selection.kind !== 'text' || !selection.isCollapsed || !selection.isSingleText) return false;
  const target = getNodeAtPath(editor.state.doc, selection.path);
  const linkType = editor.state.schema.marks.link;
  if (!target.isText || !linkType) return false;
  let link: Mark;
  try {
    link = linkType.create({
      href,
      title: attrs.title ?? '',
      target: attrs.target ?? '_blank',
    });
  } catch { return false; }
  const inserted = splitLinkedText(target, selection.from, selection.to, display, link);
  const baseIndex = selection.path.at(-1) as number;
  const path = [...selection.path.slice(0, -1), baseIndex + inserted.cursorIndex];
  const transaction = editor.state.createTransaction().replaceNode(selection.path, inserted.nodes);
  transaction.setSelection(Selection.cursor(path, inserted.cursorOffset));
  editor.dispatch(transaction);
  return true;
}

function pasteLink(editor: Editor, text: string, options: LinkBehaviorOptions): boolean {
  const candidate = text.trim();
  const looksLikeLink = /^(?:https?:\/\/|mailto:|tel:|www\.|[#/?]|\.\.\/|\.\/)/iu.test(candidate)
    || /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/u.test(candidate)
    || (!/\s/u.test(candidate) && (candidate.includes('/') || /(?:^|\/)[^/]+\.[A-Za-z\d]{1,16}(?:[?#].*)?$/u.test(candidate)));
  if (!looksLikeLink) return false;
  const href = normalizeLinkURL(text, options, 'paste');
  if (!href) return false;
  if (!editor.state.selection.isCollapsed) return setLink(editor, href, { target: options.defaultTarget ?? '_blank' });
  return insertLinkAtCaret(editor, href, text.trim(), { target: options.defaultTarget });
}

function autolinkInput(editor: Editor, from: number, to: number, input: string, options: LinkBehaviorOptions): boolean {
  if (!/\s$/.test(input)) return false;
  const selection = editor.state.selection;
  if (selection.kind !== 'text' || !selection.isSingleText || selection.from !== from || selection.to !== to) return false;
  const target = getNodeAtPath(editor.state.doc, selection.path);
  if (!target.isText || linkIn(target)) return false;
  const throughInput = `${(target.text ?? '').slice(0, from)}${input}`;
  const trailingSpace = /\s+$/.exec(throughInput)?.[0] ?? '';
  const beforeSpace = throughInput.slice(0, -trailingSpace.length);
  const token = /(?:^|\s)(\S+)$/.exec(beforeSpace)?.[1];
  if (!token || !AUTOLINK_CANDIDATE.test(token)) return false;
  const display = token.replace(/[.,!?;:]+$/, '');
  const punctuation = token.slice(display.length);
  const href = normalizeLinkURL(display, options, 'autolink');
  const linkType = editor.state.schema.marks.link;
  if (!href || !linkType) return false;
  let link: Mark;
  try { link = linkType.create({ href, title: '', target: options.defaultTarget ?? '_blank' }); }
  catch { return false; }
  const old = target.text ?? '';
  const tokenFrom = beforeSpace.length - token.length;
  const insertionEnd = from + input.length;
  const finalText = `${old.slice(0, from)}${input}${old.slice(to)}`;
  const linkEnd = tokenFrom + display.length;
  const parts: Node[] = [
    ...(tokenFrom ? [target.withText(finalText.slice(0, tokenFrom))] : []),
    target.withText(display).withMarks([...target.marks.filter((mark) => mark.type.name !== 'link'), link]),
    target.withText(`${punctuation}${trailingSpace}${finalText.slice(insertionEnd)}`),
  ];
  const linkedIndex = tokenFrom ? 1 : 0;
  const afterIndex = linkedIndex + 1;
  const transaction = editor.state.createTransaction().replaceNode(selection.path, parts);
  transaction.setSelection(Selection.cursor(
    [...selection.path.slice(0, -1), (selection.path.at(-1) as number) + afterIndex],
    punctuation.length + trailingSpace.length,
  ));
  editor.dispatch(transaction);
  return true;
}

function activatedLink(editor: Editor, event: MouseEvent): ActiveLink | null {
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!target) return null;
  const href = target.getAttribute('href') ?? '';
  const normalized = defaultNormalize(href);
  if (!normalized) return null;
  const selection = editor.state.selection;
  const active = getActiveLink(editor);
  return active?.href === normalized && active.text === (target.textContent ?? '') ? active : Object.freeze({
    href: normalized,
    title: target.getAttribute('title') ?? '',
    target: target.getAttribute('target') === '_self' ? '_self' : '_blank',
    text: target.textContent ?? '',
    path: selection.path,
    from: 0,
    to: 0,
  });
}

/** Adds configurable autolink, link-on-paste, and safe activation behavior. */
export function createLinkBehaviorExtension(options: LinkBehaviorOptions = {}): FountainExtension {
  const frozenOptions = Object.freeze({ ...options });
  const plugin = new Plugin({
    props: {
      handleTextInput: options.autolink === false
        ? undefined
        : (editor, from, to, input) => autolinkInput(editor, from, to, input, frozenOptions),
      handlePaste: options.linkOnPaste === false
        ? undefined
        : (editor, event) => {
          if (event.clipboardData?.getData('text/html')?.trim()) return false;
          return pasteLink(editor, event.clipboardData?.getData('text/plain') ?? '', frozenOptions);
        },
      handleClick: (editor, event) => {
        const active = activatedLink(editor, event);
        if (!active) return false;
        options.onActivate?.(active, event);
        const source = event.currentTarget;
        if (source instanceof HTMLElement) {
          const EventConstructor = source.ownerDocument.defaultView?.CustomEvent;
          if (EventConstructor) source.dispatchEvent(new EventConstructor('fountain-link-activate', {
            bubbles: true,
            composed: true,
            detail: active,
          }));
        }
        return true;
      },
    },
  });
  return defineExtension({
    name: 'link-behavior',
    plugins: [plugin],
    commands: { editLink, removeLink },
    services: { linkBehavior: frozenOptions },
  });
}

export const LinkBehaviorExtension = createLinkBehaviorExtension();
