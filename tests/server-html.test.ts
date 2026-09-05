import { describe, expect, it } from 'vitest';

import {
  CoreExtension,
  HTMLExporter,
  MathExtension,
  MediaExtension,
  Schema,
  composeExtensions,
  defineExtension,
} from '../src';
import { DetailsExtension } from '../src/details';
import { HTMLImportLimitError, ServerHTMLImporter } from '../src/html/server';
import { PagesExtension } from '../src/pages';
import { RubyExtension } from '../src/ruby';
import { createWidgetExtension, defineWidget } from '../src/widgets';

const portableExtension = defineExtension({
  name: 'portable-html-fixture',
  nodes: {
    callout: {
      group: 'block',
      content: 'block+',
      attrs: { tone: { default: 'info', validate: (value) => ['info', 'warning'].includes(String(value)) } },
      parseHTML: [{
        tag: 'aside[data-callout]',
        contentElement: ':scope > [data-callout-content]',
        getAttrs: (element) => ({ tone: element.dataset.tone ?? 'info' }),
      }],
      toDOM: (node) => ['aside', { 'data-callout': '', 'data-tone': node.attrs.tone }, [
        'div', { 'data-callout-content': '' }, 0,
      ]],
    },
    chip: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { label: { validate: (value) => typeof value === 'string' && value.length <= 80 } },
      parseHTML: [{
        tag: 'span[data-chip]',
        getAttrs: (element) => ({ label: element.dataset.label ?? '' }),
      }],
      toDOM: (node) => ['span', { 'data-chip': '', 'data-label': node.attrs.label }, String(node.attrs.label)],
    },
  },
  marks: {
    annotation: {
      attrs: { id: { validate: (value) => typeof value === 'string' && /^[a-z\d-]{1,40}$/i.test(value) } },
      parseHTML: [{
        tag: 'span[data-annotation-id]',
        getAttrs: (element) => ({ id: element.dataset.annotationId ?? '' }),
      }],
      toDOM: (mark) => ['span', { 'data-annotation-id': mark.attrs.id }, 0],
    },
  },
});

const widget = defineWidget({
  name: 'server_status',
  label: 'Server status',
  attributes: {
    nodeId: { validate: (value) => typeof value === 'string' && value.length > 0 },
    state: { default: 'ready', validate: (value) => value === 'ready' || value === 'busy' },
  },
});

const schema = new Schema(composeExtensions([
  CoreExtension,
  MediaExtension,
  MathExtension,
  DetailsExtension,
  RubyExtension,
  PagesExtension,
  portableExtension,
  createWidgetExtension(widget),
]).schema);

describe('DOM-free server HTML import', () => {
  it('runs in the Node test environment without DOMParser, document, or window', () => {
    expect(globalThis).not.toHaveProperty('DOMParser');
    expect(globalThis).not.toHaveProperty('document');
    expect(globalThis).not.toHaveProperty('window');

    const document = ServerHTMLImporter.parse(
      '<h2 style="text-align:center">Headless</h2><p><strong>real</strong> Node</p>',
      schema,
    );
    expect(document.child(0).toJSON()).toMatchObject({
      type: 'heading', attrs: { level: 2, align: 'center' },
    });
    expect(document.child(1).child(0).marks[0]?.type.name).toBe('strong');
    expect(document.textContent).toBe('Headlessreal Node');
  });

  it('round-trips portable extension nodes, marks, nested content, and widgets', () => {
    const annotation = schema.mark('annotation', { id: 'review-7' });
    const source = schema.node('doc', {}, [
      schema.node('callout', { tone: 'warning' }, [
        schema.node('paragraph', {}, [
          schema.text('Review ', [annotation]),
          schema.node('chip', { label: 'API' }),
        ]),
      ]),
      schema.node('server_status', { nodeId: 'widget-1', state: 'busy' }),
    ]);
    const html = HTMLExporter.export(source, { document: false });
    const result = ServerHTMLImporter.parseWithReport(html, schema);

    expect(result.document.toJSON()).toEqual(source.toJSON());
    expect(result.issues).toEqual([]);
  });

  it('reconstructs lists, merged tables, ruby, math, pages, details, text styles, and media safely', () => {
    const result = ServerHTMLImporter.parseWithReport(`
      <ol start="4"><li>One<ul><li>Nested</li></ul></li></ol>
      <table><thead><tr><th colspan="2" data-colwidth="120,180">Header</th></tr></thead>
        <tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>
      <p><ruby>東京<rt>とうきょう</rt></ruby> <span data-fountain-math="inline" data-latex="x^2">x squared</span></p>
      <hr data-fountain-page-break="true">
      <details open><summary>More</summary><p>Body</p></details>
      <p><span style="font-family:Georgia;font-size:18px;line-height:1.75;color:#123456">Styled</span></p>
      <figure data-fountain-media="video" data-align="right"><video src="https://example.com/movie.mp4" controls width="640"><track src="https://example.com/en.vtt" kind="captions" srclang="en" default></video><figcaption>Clip</figcaption></figure>
    `, schema);

    expect(result.issues).toEqual([]);
    expect(result.document.content.map((node) => node.type.name)).toEqual([
      'ordered_list', 'table', 'paragraph', 'page_break', 'details', 'paragraph', 'video',
    ]);
    expect(result.document.child(0).attrs.start).toBe(4);
    expect(result.document.child(1).child(0).child(0).attrs.colwidth).toEqual([120, 180]);
    expect(result.document.child(2).child(0).toJSON()).toMatchObject({ type: 'ruby', attrs: { rt: 'とうきょう' } });
    expect(result.document.child(2).child(2).type.name).toBe('inline_math');
    expect(result.document.child(4).attrs.open).toBe(true);
    expect(result.document.child(5).child(0).marks.map((mark) => mark.type.name)).toEqual([
      'font_family', 'font_size', 'line_height', 'text_color',
    ]);
    expect(result.document.child(6).attrs).toMatchObject({
      src: 'https://example.com/movie.mp4', caption: 'Clip', controls: true, align: 'right',
    });
  });

  it('reports browser-only attribute callbacks instead of simulating HTMLElement', () => {
    const browserOnly = defineExtension({
      name: 'browser-only-html-rule',
      nodes: {
        browser_card: {
          group: 'block',
          atom: true,
          attrs: { label: { validate: (value) => value === 'browser' } },
          parseDOM: [{ tag: 'browser-card', getAttrs: () => ({ label: 'browser' }) }],
          toDOM: () => ['browser-card'],
        },
      },
    });
    const browserSchema = new Schema(composeExtensions([CoreExtension, browserOnly]).schema);
    const result = ServerHTMLImporter.parseWithReport('<browser-card>Readable fallback</browser-card>', browserSchema);

    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.document.textContent).toBe('Readable fallback');
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'unsupported-dom-rule',
      contribution: 'node:browser_card',
      selector: 'browser-card',
    })]);
  });

  it('recovers malformed HTML, rejects executable URLs, and returns parser diagnostics', () => {
    const result = ServerHTMLImporter.parseWithReport(
      '<p data-one="1" data-one="2"><a href="javascript:alert(1)">safe text<p><img src="javascript:alert(2)" alt="bad">after',
      schema,
    );
    expect(result.document.textContent).toContain('safe text');
    expect(result.document.textContent).toContain('after');
    expect(JSON.stringify(result.document.toJSON())).not.toContain('javascript:');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.code === 'html-parse-error')).toBe(true);
  });

  it('enforces input, tree, depth, attribute-count, and attribute-value limits', () => {
    expect(() => ServerHTMLImporter.parse('<p>too large</p>', schema, { maxInputBytes: 4 }))
      .toThrow(HTMLImportLimitError);
    expect(() => ServerHTMLImporter.parse('<p><b>deep</b></p>', schema, { maxDepth: 1 }))
      .toThrow(/nesting exceeds/i);
    expect(() => ServerHTMLImporter.parse('<p><b>many</b></p>', schema, { maxNodes: 2 }))
      .toThrow(/more than 2 nodes/i);
    expect(() => ServerHTMLImporter.parse('<p a="1" b="2">attrs</p>', schema, { maxAttributesPerElement: 1 }))
      .toThrow(/more than 1 attributes/i);
    expect(() => ServerHTMLImporter.parse('<p title="12345">value</p>', schema, { maxAttributeValueLength: 4 }))
      .toThrow(/attribute value exceeds/i);
  });
});
