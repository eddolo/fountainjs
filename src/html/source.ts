import type { Node } from '../core/schema';
import { HTMLExporter, renderHTMLSourceFragment } from '../core/exporters/html-exporter';
import { readDocumentPageSettings } from '../core/page-settings';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { ServerHTMLImporter } from './server';

export interface HTMLSourceIssue {
  readonly code: 'limit' | 'unrepresentable-source' | 'source-reopen-mismatch' | 'invalid-source' | 'model-canonicalization';
  readonly message: string;
  readonly path?: readonly number[];
}

export type HTMLSourceResult =
  | { readonly ok: true; readonly sourceHTML: string; readonly sanitized: false; readonly modelRoundTrip: 'equal-except-source-tokens' | 'different'; readonly issues: readonly HTMLSourceIssue[] }
  | { readonly ok: false; readonly issues: readonly HTMLSourceIssue[] };

const types = new Set(['html_inert_inline', 'html_inert_block', 'html_inert_raw_text']);
const invalidUnicode = (value: string) => /\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
const escape = (value: string) => value.replace(/[&<>"'\r]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\r': '&#13;' })[char]!);

type HTMLNode = DefaultTreeAdapterMap['node'];
function bodyTree(html: string): DefaultTreeAdapterMap['element'] {
  const document = parse(html, { scriptingEnabled: false });
  const htmlElement = document.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as DefaultTreeAdapterMap['element'];
  return htmlElement.childNodes.find(node => 'tagName' in node && node.tagName === 'body') as DefaultTreeAdapterMap['element'];
}
function projectCarriers(node: HTMLNode): void {
  if ('tagName' in node) {
    const get = (name: string) => node.attrs.find(attr => attr.name === name)?.value;
    if (['inline', 'block', 'raw-text'].some(kind => get(`data-fountain-inert-${kind}`) === 'v1')) {
      const data = JSON.parse(get('data-fountain-inert-data') ?? 'null');
      const body = node.childNodes.find(child => 'attrs' in child && child.attrs.some(attr => attr.name === 'data-fountain-inert-content' && attr.value === 'true'));
      if (!data || !body || !('childNodes' in body)) throw new Error('Invalid source carrier in canonical HTML.');
      node.tagName = node.nodeName = data.tag;
      node.attrs = Object.entries(data.attributes).map(([name, value]) => ({ name: name.toLowerCase(), value: String(value) }));
      node.childNodes = body.childNodes;
      node.childNodes.forEach(child => { child.parentNode = node; });
    }
  }
  if ('childNodes' in node) node.childNodes.forEach(projectCarriers);
}
function htmlMeaning(node: HTMLNode): unknown {
  if (node.nodeName === '#text') return ['text', (node as DefaultTreeAdapterMap['textNode']).value];
  if (node.nodeName === '#comment') return ['comment', (node as DefaultTreeAdapterMap['commentNode']).data];
  return ['tagName' in node ? node.tagName : node.nodeName,
    'attrs' in node ? node.attrs.map(attr => [attr.namespace ?? '', attr.prefix ?? '', attr.name, attr.value]).sort() : [],
    'childNodes' in node ? node.childNodes.map(htmlMeaning) : []];
}

/** Reconstruct retained HTML as UNSANITIZED SOURCE DATA, never a reader view.
 * Event attributes, custom elements and script/style source may be present.
 * Use HTMLExporter for safe carriers. This function performs no execution or IO.
 * Canonical source spelling may change; use Markdown source snapshots for exact
 * untouched spelling. Refusal returns no partial source that looks successful.
 */
export function exportHTMLSource(document: Node, options: { readonly document?: boolean } = {}): HTMLSourceResult {
  if (document.type !== document.type.schema.topNodeType) return { ok: false, issues: [{ code: 'invalid-source', message: 'Choose a complete Fountain document for source export.' }] };
  const issues: HTMLSourceIssue[] = [];
  const opaque = new WeakSet<Node>();
  let nodes = 0, characters = 0;
  const scan = (node: Node, path: readonly number[]): boolean => {
    if (++nodes > 20_000 || path.length > 64) throw new Error('Source export limit: 20,000 nodes and depth 64.');
    let invalidText = invalidUnicode(node.text ?? '');
    const attributesJSON = JSON.stringify(node.attrs, (_key, value) => {
      if (typeof value === 'string' && invalidUnicode(value)) invalidText = true;
      return value;
    });
    characters += (node.text?.length ?? 0) + attributesJSON.length;
    if (characters > 1_048_576) throw new Error('Source export limit: 1 MiB of text and attributes.');
    if (invalidText) {
      issues.push({ code: 'unrepresentable-source', path, message: 'Portable HTML cannot preserve NUL or isolated UTF-16 surrogates; retain the Fountain document instead.' });
    }
    let retained = types.has(node.type.name);
    for (let index = 0; index < node.childCount; index++) retained = scan(node.child(index), [...path, index]) || retained;
    if (retained) opaque.add(node);
    return retained;
  };
  try { scan(document, []); } catch (error) {
    return { ok: false, issues: [{ code: 'limit', message: String(error instanceof Error ? error.message : error) }] };
  }
  if (issues.length) return { ok: false, issues };
  try {
    const fragment = renderHTMLSourceFragment(document, {
      opaque: node => opaque.has(node) || types.has(node.type.name),
      render: (node, path, children) => {
        if (!types.has(node.type.name)) return undefined;
        const tag = String(node.attrs.tag);
        const raw = node.type.name === 'html_inert_raw_text';
        if (!/^[a-z][a-z0-9.-]{0,63}$/u.test(tag) || raw && !['script', 'style', 'textarea'].includes(tag)) throw new Error('Invalid retained source tag.');
        const attributes = node.attrs.attributes;
        if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) throw new Error('Invalid retained source attributes.');
        const entries = Object.entries(attributes);
        if (entries.length > 64 || entries.some(([name, value]) => !/^[a-z_:][a-z0-9:._-]*$/u.test(name) || typeof value !== 'string' || value.length > 8_192)) throw new Error('Invalid retained source attributes.');
        const opening = `<${tag}${entries.map(([name, value]) => ` ${name}="${escape(String(value))}"`).join('')}>`;
        let body: string;
        if (raw && tag !== 'textarea') {
          body = node.textContent;
          if (body.includes('\r')) issues.push({ code: 'unrepresentable-source', path, message: 'HTML normalizes carriage returns inside script/style source; no exact source/model round trip is possible.' });
          if (new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, 'iu').test(body)) issues.push({ code: 'unrepresentable-source', path, message: 'A closing raw-text tag in the edited body can escape its source element. No source was returned.' });
        } else if (raw) {
          body = escape(node.textContent);
          if (body.startsWith('\n')) body = '\n' + body;
        } else body = children();
        return opening + body + `</${tag}>`;
      },
    });
    // A standalone leading script/style is parsed into the document head unless
    // body context is explicit. Validate the actual downloadable document.
    const settings = readDocumentPageSettings(document);
    const pageAttribute = settings ? ` data-fountain-page-settings="${escape(JSON.stringify(settings))}"` : '';
    const complete = `<!doctype html><html><head><meta charset="utf-8"></head><body${pageAttribute}>${fragment}</body></html>`;
    if (complete.length > 4_194_304) return { ok: false, issues: [{ code: 'limit', message: 'Source export exceeds 4 MiB.' }] };
    if (issues.length) return { ok: false, issues };
    // The ordinary exporter surrounds block documents with formatting LF. Our
    // source envelope owns no added whitespace: compare its fragment in the same
    // explicit body context, without removing authored text or empty nodes.
    const intended = bodyTree(`<!doctype html><html><head></head><body${pageAttribute}>${HTMLExporter.export(document, { document: false })}</body></html>`);
    projectCarriers(intended);
    if (JSON.stringify(htmlMeaning(bodyTree(complete))) !== JSON.stringify(htmlMeaning(intended))) {
      return { ok: false, issues: [{ code: 'source-reopen-mismatch', message: 'Reconstructed HTML changes source content or structure when parsed. No source was returned.' }] };
    }
    const reopened = new ServerHTMLImporter().parse(complete, document.type.schema);
    // Lexical tokens describe the earlier input, not edited canonical source.
    // Report other model differences separately from HTML structure/content.
    const comparable = (node: Node): unknown => ({
      type: node.type.name,
      attrs: Object.fromEntries(Object.entries(node.attrs).filter(([key]) => !(types.has(node.type.name) && key === 'tokens'))),
      ...(node.isText ? { text: node.text } : {}),
      marks: node.marks.map(mark => mark.toJSON()),
      content: node.content.map(comparable),
    });
    const modelEqual = JSON.stringify(comparable(reopened)) === JSON.stringify(comparable(document));
    if (!modelEqual) issues.push({ code: 'model-canonicalization', message: 'HTML reimport differs from the Fountain model beyond old source tokens. Keep Fountain JSON for exact native document retention.' });
    return { ok: true, sourceHTML: options.document === false ? fragment : complete, sanitized: false,
      modelRoundTrip: modelEqual ? 'equal-except-source-tokens' : 'different', issues };
  } catch (error) {
    return { ok: false, issues: [{ code: 'invalid-source', message: error instanceof Error ? error.message : String(error) }] };
  }
}
