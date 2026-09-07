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
  it('preserves unfamiliar wrapper structure without a browser and reports the discarded wrapper once', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const inner = '<h2>Incident handover</h2><p>First paragraph</p><p>Second paragraph</p><ul><li>Check health</li></ul><table><tr><td>Evidence</td></tr></table>';
    const result = ServerHTMLImporter.parseWithReport(`<outer-panel><inner-panel>${inner}</inner-panel></outer-panel>`, schema);
    expect(result.document.toJSON()).toEqual(ServerHTMLImporter.parse(inner, schema).toJSON());
    expect(result.issues).toEqual([expect.objectContaining({ code: 'unmapped-block-wrapper' })]);
    expect(Object.isFrozen(result.issues[0])).toBe(true);
  });

  it('keeps existing depth limits when discovering blocks within unfamiliar wrappers', () => {
    const html = `${'<unknown-wrap>'.repeat(30)}<p>Deep but bounded</p>${'</unknown-wrap>'.repeat(30)}`;
    expect(ServerHTMLImporter.parse(html, schema).textContent).toBe('Deep but bounded');
    expect(() => ServerHTMLImporter.parse(html, schema, { maxDepth: 20 })).toThrow(HTMLImportLimitError);
  });

  it.each(['throws', 'array', 'prototype', 'attributes', 'content', 'missing-content'] as const)('reports %s custom-node failures while retaining readable fallback', failure => {
    const customSchema = new Schema(composeExtensions([CoreExtension, defineExtension({
      name: 'invalid-html-rule',
      nodes: {
        card: {
          group: 'block', atom: failure !== 'content',
          ...(failure === 'content' ? { content: 'heading+' } : {}),
          attrs: { level: { default: 1, validate: value => value === 1 } },
          parseHTML: [{
            tag: 'custom-card',
            ...(failure === 'missing-content' ? { contentElement: '.missing' } : {}),
            getAttrs: () => {
              if (failure === 'throws') throw new Error('Private payload must not be included');
              if (failure === 'array') return [] as unknown as Record<string, unknown>;
              if (failure === 'prototype') return new Date() as unknown as Record<string, unknown>;
              return { level: failure === 'attributes' ? 2 : 1 };
            },
          }],
        },
      },
    })]).schema);
    const result = ServerHTMLImporter.parseWithReport('<custom-card>Keep this text</custom-card><custom-card>And this</custom-card>', customSchema);
    expect(result.document.textContent).toContain('Keep this text');
    expect(result.document.textContent).toContain('And this');
    expect(result.document.content.every(node => node.type.name === 'paragraph')).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'invalid-rule-result', contribution: 'node:card', selector: 'custom-card',
    }), expect.objectContaining({ code: 'unmapped-block-wrapper' })]);
    expect(result.issues[0].message).not.toContain('Private payload');
    expect(Object.isFrozen(result.issues[0])).toBe(true);
  });

  it('reports invalid custom marks while keeping unmarked readable content', () => {
    const customSchema = new Schema(composeExtensions([CoreExtension, defineExtension({
      name: 'invalid-html-mark',
      marks: { badge: {
        attrs: { kind: { validate: value => value === 'known' } },
        parseHTML: [{ tag: 'span[data-badge]', getAttrs: () => ({ kind: 'invalid' }) }],
      } },
    })]).schema);
    const result = ServerHTMLImporter.parseWithReport('<p><span data-badge>Keep text</span></p>', customSchema);
    expect(result.document.textContent).toBe('Keep text');
    expect(result.document.child(0).child(0).marks).toHaveLength(0);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'invalid-rule-result', contribution: 'mark:badge' })]);
  });

  it('treats false as an intentional decline and proceeds to the next rule without a warning', () => {
    const customSchema = new Schema(composeExtensions([CoreExtension, defineExtension({
      name: 'declining-html-rule',
      nodes: { card: {
        group: 'block', atom: true,
        parseHTML: [
          { tag: 'custom-card', priority: 100, contentElement: '.missing', getAttrs: () => false },
          { tag: 'custom-card', getAttrs: () => ({}) },
        ],
      } },
    })]).schema);
    const result = ServerHTMLImporter.parseWithReport('<custom-card>Used by fallback rule</custom-card>', customSchema);
    expect(result.document.child(0).type.name).toBe('card');
    expect(result.issues).toEqual([]);
  });

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

  it('preserves an ordered-list start of zero without a browser DOM', () => {
    const imported = ServerHTMLImporter.parse('<ol start="0"><li>Zero</li><li>One</li></ol>', schema);

    expect(imported.child(0).attrs.start).toBe(0);
    expect(HTMLExporter.export(imported, { document: false }))
      .toBe('<ol start="0"><li><p>Zero</p></li><li><p>One</p></li></ol>');
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
    }), expect.objectContaining({ code: 'unmapped-block-wrapper' })]);
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
    expect(result.issues.map(issue => issue.code)).toEqual(['html-parse-error', 'rejected-url', 'rejected-url']);
    expect(result.issues.some(issue => issue.message.includes('link URLs'))).toBe(true);
    expect(result.issues.some(issue => issue.message.includes('source URLs'))).toBe(true);
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
