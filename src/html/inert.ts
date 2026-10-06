import type { Attributes, HTMLParseElement, HTMLSourceTokens } from '../core/schema';
import { defineExtension, type FountainExtension } from '../extensions/extension';
import type { Editor } from '../core/editor';
import { Selection } from '../core/selection';
import { getNodeAtPath } from '../core/transaction/path';

const payload = 'data-fountain-inert-data';
const content = 'data-fountain-inert-content';
// This factory owns explicitly registered unknown inline tags, never standard
// HTML semantics, raw-text/active content or foreign namespaces.
const reserved = new Set(('a abbr address area article aside audio b base bdi bdo big blockquote body br button canvas caption center cite code col colgroup data datalist dd del details dfn dialog dir div dl dt em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark marquee math menu meta meter nav nobr noembed noframes noscript object ol optgroup option output p param picture plaintext pre progress q rb rp rt rtc ruby s samp script search section select slot small source span strike strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr xmp').split(' '));

export interface InertHTMLInlineOptions {
  /** Unknown inline tags owned by this extension, not a wildcard HTML renderer. */
  readonly tags: readonly string[];
}

export interface InertHTMLRawTextOptions {
  /** Explicit inert capture, never a live script, stylesheet or form control. */
  readonly tags: readonly ('script' | 'style' | 'textarea')[];
}

export interface InertHTMLBlockOptions {
  /** Unknown wrappers whose children are interpreted as editable blocks. */
  readonly tags: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function attributes(value: unknown): boolean {
  return record(value) && Object.keys(value).length <= 64
    && Object.entries(value).every(([name, text]) => /^[a-z_:][a-z0-9:._-]*$/iu.test(name)
      && typeof text === 'string' && text.length <= 8_192)
    && JSON.stringify(value).length <= 16_384;
}

function tokens(value: unknown): value is HTMLSourceTokens | null {
  return value === null || (record(value) && Object.keys(value).length === 3
    && Object.hasOwn(value, 'startTag') && Object.hasOwn(value, 'endTag') && Object.hasOwn(value, 'origin')
    && typeof value.startTag === 'string' && value.startTag.length <= 8_192
    && (value.endTag === null || typeof value.endTag === 'string' && value.endTag.length <= 128)
    && (value.origin === 'html-input' || value.origin === 'markdown-projection'));
}

/**
 * Preserve registered unknown inline HTML as inert data with editable children.
 * Original behavior/layout is not reproduced. Source spelling is available only
 * when an importer supplies source tokens. Stored data never becomes live HTML.
 */
export function createInertHTMLInlineExtension(options: InertHTMLInlineOptions): FountainExtension {
  return createInertExtension(options?.tags, 'inline');
}

/** Preserve HTML raw-text bodies as literal editable source, never executable HTML. */
export function createInertHTMLRawTextExtension(options: InertHTMLRawTextOptions): FountainExtension {
  return createInertExtension(options?.tags, 'raw');
}

/** Retain explicitly registered unknown block wrappers, not their HTML behavior. */
export function createInertHTMLBlockExtension(options: InertHTMLBlockOptions): FountainExtension {
  return createInertExtension(options?.tags, 'block');
}

/** Add an editable paragraph without silently changing an imported empty wrapper. */
export function appendInertHTMLBlockParagraph(editor: Editor, path: readonly number[]): boolean {
  if (!editor.editable || !path.length || !path.every(index => Number.isInteger(index) && index >= 0)) return false;
  try {
    const node = getNodeAtPath(editor.state.doc, path);
    if (node.type.name !== 'html_inert_block' || !editor.state.schema.nodes.paragraph) return false;
    const paragraph = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('')]);
    return editor.dispatch(editor.createTransaction().replaceNode(path, [node.copy([...node.content, paragraph])])
      .setSelection(Selection.cursor([...path, node.childCount, 0], 0)));
  } catch { return false; }
}

function createInertExtension(supplied: readonly string[] | undefined, mode: 'inline' | 'raw' | 'block'): FountainExtension {
  const rawText = mode === 'raw';
  const block = mode === 'block';
  const marker = rawText ? 'data-fountain-inert-raw-text' : block ? 'data-fountain-inert-block' : 'data-fountain-inert-inline';
  const bodyTag = rawText ? 'code' : block ? 'div' : 'span';
  const shellTag = block ? 'div' : 'span';
  if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > 64
    || supplied.some(tag => typeof tag !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/u.test(tag)
      || (rawText ? !['script', 'style', 'textarea'].includes(tag) : reserved.has(tag)))
    || new Set(supplied).size !== supplied.length) {
    throw new TypeError(rawText ? 'Inert raw text requires distinct script, style or textarea tags.'
      : `Inert HTML requires 1–64 distinct lowercase unknown ${mode} tags.`);
  }
  const names = new Set(supplied);
  const data = (attrs: Readonly<Attributes>): Attributes => ({ tag: attrs.tag, attributes: attrs.attributes, tokens: attrs.tokens });
  const validTag = (value: unknown): boolean => typeof value === 'string' && names.has(value);
  const validData = (value: unknown): value is Attributes => record(value)
    && Object.keys(value).length === 3 && Object.hasOwn(value, 'tag') && Object.hasOwn(value, 'attributes') && Object.hasOwn(value, 'tokens')
    && validTag(value.tag) && attributes(value.attributes) && tokens(value.tokens);
  const carrier = (element: HTMLParseElement): Attributes | false => {
    const keys = element.getAttributeNames?.();
    const encoded = element.getAttribute(payload);
    if (!keys || keys.some(name => name !== marker && name !== payload) || !encoded || encoded.length > 32_768) return false;
    try {
      const parsed: unknown = JSON.parse(encoded);
      if (!validData(parsed) || !element.querySelectorAll) return false;
      const children = Array.from(element.querySelectorAll(':scope > *'));
      const [body, badge] = children;
      const label = ` ⟦${String(parsed.tag)}: ${rawText ? 'inert source' : 'retained HTML'}⟧`;
      const badgeKeys = badge?.getAttributeNames?.();
      // Only our exact writer shell may hide a badge from model content. If a
      // caller edits that shell, decline it and preserve its visible children.
      if (children.length !== 2 || body.tagName.toLowerCase() !== bodyTag || badge.tagName.toLowerCase() !== 'span'
        || body.getAttribute(content) !== 'true' || body.getAttributeNames?.().length !== 1
        || badge.getAttribute('data-fountain-inert-badge') !== 'true' || badge.textContent !== label
        || !badgeKeys || badgeKeys.some(name => !['data-fountain-inert-badge', 'contenteditable', 'title', 'aria-label'].includes(name))
        || !badge.querySelectorAll || badge.querySelectorAll(':scope > *').length
        || element.textContent !== body.textContent + label) return false;
      return parsed;
    }
    catch { return false; }
  };
  return defineExtension({
    name: rawText ? 'html-inert-raw-text' : block ? 'html-inert-block' : 'html-inert-inline',
    ...(block ? { commands: { appendInertHTMLBlockParagraph } } : {}),
    nodes: { [rawText ? 'html_inert_raw_text' : block ? 'html_inert_block' : 'html_inert_inline']: {
      inline: !block, group: block ? 'block' : 'inline', content: rawText ? 'text*' : block ? 'block*' : 'inline*', ...(rawText ? { code: true } : {}), selectable: true, markdown: 'html',
      attrs: { tag: { validate: validTag }, attributes: { default: {}, validate: attributes }, tokens: { default: null, validate: tokens } },
      validate: node => JSON.stringify(data(node.attrs)).length <= 32_768,
      parseHTML: [
        { tag: `${shellTag}[${marker}="v1"]`, priority: 100, getAttrs: carrier, contentElement: `:scope > ${bodyTag}[${content}="true"]` },
        { tag: [...names].map(tag => tag.replaceAll('.', '\\.')).join(','), priority: 0, getAttrs: element => {
          const keys = element.getAttributeNames?.();
          return keys ? { tag: element.tagName.toLowerCase(),
            attributes: Object.fromEntries(keys.map(name => [name, element.getAttribute(name)])),
            tokens: element.getSourceTokens?.() ?? null } : false;
        } },
      ],
      toDOM: node => [shellTag, { [marker]: 'v1', [payload]: JSON.stringify(data(node.attrs)) },
        [bodyTag, { [content]: 'true' }, 0],
        ['span', { 'data-fountain-inert-badge': 'true', contenteditable: 'false',
          title: rawText ? 'Literal source retained as data; scripts, styles and controls are not executed.'
            : 'Unknown HTML retained as data; behavior and layout are not reproduced.',
          'aria-label': `Preserved ${String(node.attrs.tag)} HTML` }, ` ⟦${String(node.attrs.tag)}: ${rawText ? 'inert source' : 'retained HTML'}⟧`]],
    } },
  });
}
