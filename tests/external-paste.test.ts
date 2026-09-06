// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  AllSelection,
  CoreExtension,
  EditorView,
  HTMLImporter,
  MathExtension,
  composeExtensions,
  createEditor,
  defineExtension,
  detectExternalPasteSource,
  normalizeExternalPasteHTML,
  selectNode,
  type ExternalPasteReport,
} from '../src';
import { PagesExtension } from '../src/pages';
import { RubyExtension } from '../src/ruby';

function richSchema() {
  return createEditor({
    schema: composeExtensions([CoreExtension, MathExtension, PagesExtension, RubyExtension]).schema,
  }).state.schema;
}

function clipboardEvent(type: 'copy' | 'paste', values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const event = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: {
    files: [],
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => { data.set(format, value); },
  } });
  return { event, data };
}

describe('external clipboard normalization', () => {
  it('detects the source without depending on a proprietary clipboard MIME type', () => {
    expect(detectExternalPasteSource('<p data-fountain-node="paragraph">Own</p>')).toBe('fountain');
    expect(detectExternalPasteSource('<table style="mso-number-format:General"><tr><td>1</td></tr></table>')).toBe('microsoft-excel');
    expect(detectExternalPasteSource('<p style="mso-list:l0 level1 lfo1">Word</p>')).toBe('microsoft-word');
    expect(detectExternalPasteSource('<b id="docs-internal-guid-123">Docs</b>')).toBe('google-docs');
    expect(detectExternalPasteSource('<math><mi>x</mi></math>')).toBe('mathml');
    expect(detectExternalPasteSource('<p>Web</p>')).toBe('generic-html');
  });

  it('turns Word list paragraphs into nested semantic lists and accepts tracked changes by default', () => {
    const result = normalizeExternalPasteHTML(`
      <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1;color:#123456">
        <span style="mso-list:Ignore">1. </span>First <ins>kept</ins><del>gone</del>
      </p>
      <p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">
        <span style="mso-list:Ignore">• </span><strong>Nested</strong>
      </p>
      <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">
        <span style="mso-list:Ignore">2. </span>Second
      </p>
      <script>alert('never import me')</script>
    `);

    expect(result.source).toBe('microsoft-word');
    expect(result.html).toContain('<ol>');
    expect(result.html).toContain('<ul>');
    expect(result.html).toContain('kept');
    expect(result.html).not.toContain('gone');
    expect(result.html).not.toContain('script');
    expect(result.html).not.toContain('mso-');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'unsafe-content-removed',
      'word-list-normalized',
      'tracked-change-accepted',
    ]));

    const document = HTMLImporter.parse(result.html, richSchema());
    expect(document.child(0).type.name).toBe('ordered_list');
    expect(document.child(0).child(0).child(1).type.name).toBe('bullet_list');
    expect(document.textContent).toContain('First kept');
    expect(document.textContent).toContain('Nested');
    expect(document.textContent).not.toContain('gone');
  });

  it('supports explicit tracked-change rejection and a visible lossy fallback', () => {
    const rejected = normalizeExternalPasteHTML(
      '<p style="mso-list:none"><ins>new</ins><del>old</del></p>',
      { trackedChanges: 'reject' },
    );
    expect(rejected.html).not.toContain('new');
    expect(rejected.html).toContain('old');
    expect(rejected.issues).toContainEqual(expect.objectContaining({ code: 'tracked-change-rejected', lossy: true }));

    const visible = normalizeExternalPasteHTML(
      '<b id="docs-internal-guid-1"><p><ins data-author="Ada">new</ins><del>old</del></p></b>',
      { trackedChanges: 'preserve-visible' },
    );
    expect(visible.source).toBe('google-docs');
    expect(visible.html).toContain('<ins data-author="Ada">new</ins>');
    expect(visible.html).toContain('<del>old</del>');
    expect(visible.issues).toContainEqual(expect.objectContaining({ code: 'tracked-change-metadata-dropped', lossy: true }));
  });

  it('preserves Excel table structure while removing Office-only metadata', () => {
    const result = normalizeExternalPasteHTML(`
      <html xmlns:x="urn:schemas-microsoft-com:office:excel"><body>
        <table style="mso-number-format:General"><tr><th colspan="2">Quarter</th></tr>
          <tr><td rowspan="2">North</td><td style="background-color:#ffeeaa">10</td></tr>
          <tr><td>20</td></tr>
        </table>
      </body></html>
    `);
    expect(result.source).toBe('microsoft-excel');
    expect(result.html).not.toContain('mso-number-format');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'spreadsheet-table-preserved', lossy: false }));
    const table = HTMLImporter.parse(result.html, richSchema()).child(0);
    expect(table.type.name).toBe('table');
    expect(table.child(0).child(0).attrs.colspan).toBe(2);
    expect(table.child(1).child(0).attrs.rowspan).toBe(2);
    expect(table.child(1).child(1).child(0).child(0).marks[0]?.type.name).toBe('highlight');
  });

  it('imports annotated MathML, ruby, and semantic footnotes without flattening them', () => {
    const result = normalizeExternalPasteHTML(`
      <p>Use <math aria-label="x squared"><semantics><msup><mi>x</mi><mn>2</mn></msup>
        <annotation encoding="application/x-tex">x^2</annotation></semantics></math>
        and <ruby>東京<rt>とうきょう</rt></ruby><a role="doc-noteref" href="#note-1">1</a>.</p>
      <section role="doc-footnote" id="note-1"><p>Source note</p></section>
    `);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'mathml-latex-preserved', lossy: false }));
    const document = HTMLImporter.parse(result.html, richSchema());
    const types: string[] = [];
    document.descendants((node) => { types.push(node.type.name); });
    expect(types).toEqual(expect.arrayContaining(['inline_math', 'ruby', 'footnote_reference', 'footnote_definition']));
    expect(JSON.stringify(document.toJSON())).toContain('x^2');
    expect(JSON.stringify(document.toJSON())).toContain('とうきょう');
  });

  it('reports MathML without TeX as readable text instead of claiming exact conversion', () => {
    const result = normalizeExternalPasteHTML('<p><math aria-label="alpha plus beta"><mi>α</mi><mo>+</mo><mi>β</mi></math></p>');
    expect(result.html).toContain('alpha plus beta');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'mathml-readable-fallback', lossy: true }));
    expect(HTMLImporter.parse(result.html, richSchema()).textContent).toBe('alpha plus beta');
  });

  it('exposes an immutable source-aware report after a real editor paste', () => {
    const reports: ExternalPasteReport[] = [];
    const errors = vi.fn();
    const editor = createEditor({ schema: richSchema().spec });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, {
      paste: { onReport: (report) => reports.push(report) },
      onError: errors,
    });
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/html'
        ? '<b id="docs-internal-guid-report"><p><strong>Docs</strong> paste</p></b>'
        : type === 'text/plain' ? 'Docs paste' : '',
    } });
    view.dom.dispatchEvent(event);

    expect(errors).not.toHaveBeenCalled();
    expect(editor.getText()).toContain('Docs paste');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ source: 'google-docs', outcome: 'inserted-rich-html' });
    expect(Object.isFrozen(reports[0])).toBe(true);
    expect(Object.isFrozen(reports[0]?.issues)).toBe(true);
    view.destroy();
  });

  it('does not reinterpret Fountain rich HTML through plain-text paste rules', () => {
    const schema = composeExtensions([CoreExtension, MathExtension]).schema;
    const editor = createEditor({ schema });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/html'
        ? '<p data-fountain-path="0"><strong>$x$</strong> stays literal</p>'
        : type === 'text/plain' ? '$x$ stays literal' : '',
    } });
    view.dom.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(editor.state.doc.child(0).child(0).marks[0]?.type.name).toBe('strong');
    expect(editor.state.doc.child(0).child(0).text).toBe('$x$');
    expect(JSON.stringify(editor.getJSON())).not.toContain('inline_math');
    view.destroy();
  });

  it('copies extension-owned Fountain JSON exactly and provides portable HTML and text fallbacks', () => {
    const widget = defineExtension({
      name: 'clipboard-widget',
      nodes: {
        clipboard_widget: {
          group: 'block', atom: true,
          attrs: { count: { default: 0, validate: (value) => Number.isInteger(value) } },
          toText: (node) => `Widget ${String(node.attrs.count)}`,
          toDOM: (node) => ['div', { 'data-portable-widget': '', 'data-count': node.attrs.count }, `Widget ${String(node.attrs.count)}`],
        },
      },
    });
    const schema = composeExtensions([CoreExtension, widget]).schema;
    const source = createEditor({
      schema,
      content: {
        type: 'doc',
        content: [
          { type: 'clipboard_widget', attrs: { count: 9 } },
          { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        ],
      },
    });
    const sourceMount = document.createElement('div');
    document.body.appendChild(sourceMount);
    const sourceView = new EditorView(sourceMount, source);
    expect(selectNode(source, [0])).toBe(true);
    const copied = clipboardEvent('copy');
    sourceView.dom.dispatchEvent(copied.event);

    expect(copied.event.defaultPrevented).toBe(true);
    expect(copied.data.get('text/plain')).toBe('Widget 9');
    expect(copied.data.get('text/html')).toBe('<div data-portable-widget="" data-count="9">Widget 9</div>');
    expect(copied.data.get('text/html')).not.toContain('data-fountain-path');
    expect(JSON.parse(copied.data.get('application/x-fountainjs+json') ?? '{}')).toEqual({
      version: 1,
      document: { type: 'doc', content: [{ type: 'clipboard_widget', attrs: { count: 9 } }] },
    });

    const target = createEditor({ schema });
    const targetMount = document.createElement('div');
    document.body.appendChild(targetMount);
    const reports: ExternalPasteReport[] = [];
    const targetView = new EditorView(targetMount, target, { paste: { onReport: (report) => reports.push(report) } });
    target.dispatch(target.state.createTransaction().setSelection(new AllSelection(target.state.doc)));
    const pasted = clipboardEvent('paste', Object.fromEntries(copied.data));
    targetView.dom.dispatchEvent(pasted.event);

    expect(pasted.event.defaultPrevented).toBe(true);
    expect(target.getJSON()).toEqual({ type: 'doc', content: [{ type: 'clipboard_widget', attrs: { count: 9 } }] });
    expect(reports).toContainEqual(expect.objectContaining({ source: 'fountain', outcome: 'inserted-fountain-document' }));
    sourceView.destroy();
    targetView.destroy();
  });

  it('falls back to semantic HTML when a Fountain clipboard node is not in the receiving schema', () => {
    const errors = vi.fn();
    const reports: ExternalPasteReport[] = [];
    const editor = createEditor({ schema: composeExtensions([CoreExtension]).schema });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, { onError: errors, paste: { onReport: (report) => reports.push(report) } });
    const paste = clipboardEvent('paste', {
      'application/x-fountainjs+json': JSON.stringify({
        version: 1,
        document: { type: 'doc', content: [{ type: 'extension_only_widget', attrs: { value: 7 } }] },
      }),
      'text/html': '<p><strong>Readable fallback</strong></p>',
      'text/plain': 'Readable fallback',
    });
    view.dom.dispatchEvent(paste.event);

    expect(paste.event.defaultPrevented).toBe(true);
    expect(editor.getText()).toContain('Readable fallback');
    expect(editor.state.doc.child(0).child(0).marks[0]?.type.name).toBe('strong');
    expect(errors).not.toHaveBeenCalled();
    expect(reports).toContainEqual(expect.objectContaining({
      source: 'fountain',
      outcome: 'inserted-rich-html',
      issues: [expect.objectContaining({ code: 'fountain-document-fallback', lossy: true })],
    }));
    view.destroy();
  });
});
