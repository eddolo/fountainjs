// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  HTMLExporter,
  HTMLImporter,
  Schema,
  composeExtensions,
  defineExtension,
} from '../src';

const customHTML = defineExtension({
  name: 'custom-html-round-trip',
  nodes: {
    callout: {
      group: 'block',
      content: 'block+',
      attrs: {
        tone: { default: 'info', validate: (value) => value === 'info' || value === 'warning' },
      },
      parseDOM: [{
        tag: 'aside[data-fountain-callout]',
        contentElement: '[data-callout-content]',
        getAttrs: (element) => ({ tone: element.dataset.tone ?? 'info' }),
      }],
      toDOM: (node) => ['aside', {
        'data-fountain-callout': '',
        'data-tone': node.attrs.tone,
      }, ['div', { 'data-callout-content': '' }, 0]],
    },
    chip: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { label: { validate: (value) => typeof value === 'string' && value.length <= 80 } },
      parseDOM: [{
        tag: 'span[data-fountain-chip]',
        getAttrs: (element) => ({ label: element.dataset.label ?? '' }),
      }],
      toDOM: (node) => ['span', {
        'data-fountain-chip': '',
        'data-label': node.attrs.label,
      }, String(node.attrs.label)],
      toText: (node) => String(node.attrs.label),
    },
  },
  marks: {
    annotation: {
      attrs: { id: { validate: (value) => typeof value === 'string' && /^[a-z\d-]{1,40}$/i.test(value) } },
      parseDOM: [{
        tag: 'span[data-annotation-id]',
        getAttrs: (element) => ({ id: element.dataset.annotationId ?? '' }),
      }],
      toDOM: (mark) => ['span', { 'data-annotation-id': mark.attrs.id }, 0],
    },
  },
});

const kit = composeExtensions([CoreExtension, customHTML]);
const schema = new Schema(kit.schema);

describe('schema-owned HTML interchange', () => {
  it('round-trips extension-defined block, inline atom, mark, attributes, and nested content', () => {
    const annotation = schema.mark('annotation', { id: 'note-7' });
    const document = schema.node('doc', {}, [
      schema.node('callout', { tone: 'warning' }, [
        schema.node('paragraph', {}, [
          schema.text('Review ', [annotation]),
          schema.node('chip', { label: 'API' }),
          schema.text(' contract'),
        ]),
        schema.node('blockquote', {}, [
          schema.node('paragraph', {}, [schema.text('Nested content')]),
        ]),
      ]),
    ]);

    const html = HTMLExporter.export(document, { document: false });
    expect(html).toContain('data-fountain-callout');
    expect(html).toContain('data-annotation-id="note-7"');
    expect(html).toContain('data-fountain-chip');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(document.toJSON());
  });

  it('imports common inline CSS semantics and preserves safe link metadata', () => {
    const document = HTMLImporter.parse(`
      <p><span style="font-weight:700;font-style:italic;text-decoration:underline line-through;color:rgb(255, 0, 16);background-color:#abc">Styled</span>
      <a href="https://example.com/docs" title="Documentation" target="_self">link</a></p>
    `, schema);
    const styled = document.child(0).content.find((node) => node.text === 'Styled');
    expect(styled?.marks.map((mark) => mark.type.name)).toEqual([
      'strong', 'em', 'underline', 'strike', 'text_color', 'highlight',
    ]);
    expect(styled?.marks.find((mark) => mark.type.name === 'text_color')?.attrs.color).toBe('#ff0010');
    expect(styled?.marks.find((mark) => mark.type.name === 'highlight')?.attrs.color).toBe('#aabbcc');

    const html = HTMLExporter.export(document, { document: false });
    expect(html).toContain('title="Documentation" target="_self"');
    const restored = HTMLImporter.parse(html, schema);
    const restoredMarks = restored.child(0).content.find((node) => node.text === 'Styled')?.marks ?? [];
    expect(new Set(restoredMarks.map((mark) => mark.type.name))).toEqual(new Set(styled?.marks.map((mark) => mark.type.name)));
    expect(restoredMarks.find((mark) => mark.type.name === 'text_color')?.attrs.color).toBe('#ff0010');
    expect(restoredMarks.find((mark) => mark.type.name === 'highlight')?.attrs.color).toBe('#aabbcc');
  });

  it('preserves an explicit empty link without turning an anchor missing href into one', () => {
    const document = HTMLImporter.parse('<p><a href="">Empty</a> <a>No href</a></p>', schema);
    const empty = document.child(0).content.find((node) => node.text === 'Empty');
    const missing = document.child(0).content.find((node) => node.text === 'No href');

    expect(empty?.marks.find((mark) => mark.type.name === 'link')?.attrs.href).toBe('');
    expect(missing?.marks.some((mark) => mark.type.name === 'link')).toBe(false);
    const html = HTMLExporter.export(document, { document: false });
    expect(html).toContain('<a href=""');
    const restored = HTMLImporter.parse(html, schema);
    expect(restored.textContent).toBe(document.textContent);
    expect(restored.child(0).content.find((node) => node.text === 'Empty')
      ?.marks.find((mark) => mark.type.name === 'link')?.attrs.href).toBe('');
  });

  it('contains failing rules, rejects invalid attributes, and preserves readable fallback text', () => {
    const guarded = defineExtension({
      name: 'guarded-import',
      nodes: {
        guarded: {
          group: 'block',
          content: 'inline*',
          attrs: { level: { validate: (value) => value === 'safe' } },
          parseDOM: [
            { tag: '[', priority: 100 },
            { tag: 'aside[data-guarded="throw"]', getAttrs: () => { throw new Error('host bug'); } },
            {
              tag: 'aside[data-guarded]',
              getAttrs: (element) => element.dataset.guarded === 'throw' ? false : { level: element.dataset.level },
            },
          ],
          toDOM: () => ['aside', 0],
        },
      },
    });
    const guardedSchema = new Schema(composeExtensions([CoreExtension, guarded]).schema);
    const imported = HTMLImporter.parse('<aside data-guarded data-level="unsafe">Readable fallback</aside>', guardedSchema);
    expect(imported.child(0).type.name).toBe('paragraph');
    expect(imported.textContent).toBe('Readable fallback');
    const thrown = HTMLImporter.parse('<aside data-guarded="throw" data-level="safe">Still readable</aside>', guardedSchema);
    expect(thrown.child(0).type.name).toBe('paragraph');
    expect(thrown.textContent).toBe('Still readable');
  });

  it('uses explicit rule priority when extension selectors overlap', () => {
    const prioritized = defineExtension({
      name: 'prioritized-html-import',
      nodes: {
        low_priority: {
          group: 'block', content: 'inline*',
          parseDOM: [{ tag: 'section[data-shared-rule]', priority: 10 }],
          toDOM: () => ['section', 0],
        },
        high_priority: {
          group: 'block', content: 'inline*',
          parseDOM: [{ tag: 'section[data-shared-rule]', priority: 100 }],
          toDOM: () => ['section', 0],
        },
      },
    });
    const prioritizedSchema = new Schema(composeExtensions([CoreExtension, prioritized]).schema);
    const imported = HTMLImporter.parse('<section data-shared-rule>Chosen</section>', prioritizedSchema);
    expect(imported.child(0).type.name).toBe('high_priority');
    expect(imported.textContent).toBe('Chosen');
  });

  it('sanitizes generic extension DOM and never emits executable custom markup', () => {
    const hostile = defineExtension({
      name: 'hostile-html-output',
      nodes: {
        panel: {
          group: 'block',
          content: 'inline*',
          toDOM: () => ['aside', {
            'data-safe': 'kept',
            onclick: 'alert(1)',
            srcdoc: '<script>alert(1)</script>',
            href: 'javascript:alert(1)',
            style: 'background:url(javascript:alert(1))',
          }, 0],
        },
      },
      marks: { executable: { toDOM: () => ['script', 0] } },
    });
    const hostileSchema = new Schema(composeExtensions([CoreExtension, hostile]).schema);
    const document = hostileSchema.node('doc', {}, [hostileSchema.node('panel', {}, [
      hostileSchema.text('Safe text', [hostileSchema.mark('executable')]),
    ])]);
    const html = HTMLExporter.export(document, { document: false });
    expect(html).toBe('<aside data-safe="kept">Safe text</aside>');
    expect(html).not.toMatch(/script|onclick|srcdoc|javascript|url\(/i);
  });

  it('validates the complete imported tree before returning it', () => {
    expect(() => HTMLImporter.parse('<ul></ul>', schema)).toThrow(/Content of bullet_list/);
  });

  it('ignores formatting whitespace between nested block elements', () => {
    const imported = HTMLImporter.parse(`
      <blockquote>
        <p>Quoted introduction.</p>
        <ol start="4">
          <li>
            <p>First block.</p>
            <p>Second block.</p>
          </li>
        </ol>
      </blockquote>
    `, schema);

    const quote = imported.child(0);
    expect(quote.content.map((node) => node.type.name)).toEqual(['paragraph', 'ordered_list']);
    expect(quote.child(1).attrs.start).toBe(4);
    expect(quote.child(1).child(0).content.map((node) => node.type.name))
      .toEqual(['paragraph', 'paragraph']);
  });
});
