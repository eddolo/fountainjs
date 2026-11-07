import { expect, it } from 'vitest';
import { CoreSchemaSpec } from '../src/extensions';
import { HTMLExporter, MarkdownExporter, MarkdownImporter, Schema } from '../src/headless';
import { createHTMLSourceMarkdownAdapter, exportHTMLSource } from '../src/html/source';

const schema = new Schema(CoreSchemaSpec);
const reader = { document: false, omitMarkdownCaretHosts: true } as const;

it.each([
  ['[unused]: /path\n', ''],
  ['>\n', '<blockquote></blockquote>'],
  ['- Alpha\n-\n- Omega\n', '<ul><li><p>Alpha</p></li><li></li><li><p>Omega</p></li></ul>'],
  ['1.\n', '<ol><li></li></ol>'],
])('omits the synthesized child of an empty Markdown container: %j', (markdown, expected) => {
  const imported = MarkdownImporter.parseWithSource(markdown, schema, { parseHTMLDocument: createHTMLSourceMarkdownAdapter() });
  const initial = imported.document.toJSON();
  expect(HTMLExporter.export(imported.document, reader)).toBe(expected);
  expect(HTMLExporter.export(imported.document, { document: false })).toContain('<p></p>');
  expect(exportHTMLSource(imported.document, reader)).toMatchObject({ ok: true, sourceHTML: expected });
  expect(imported.document.toJSON()).toEqual(initial);
  expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(markdown);
});

it('keeps an authored empty paragraph and a JSON-reopened caret child', () => {
  const document = MarkdownImporter.parse('>\n\n<p data-fountain-empty="text"></p>\n', schema);
  expect(HTMLExporter.export(document, reader)).toBe('<blockquote></blockquote>\n<p></p>');
  expect(HTMLExporter.export(schema.nodeFromJSON(document.toJSON()), reader)).toBe('<blockquote><p></p></blockquote>\n<p></p>');
});

it('keeps a moved child and the text typed into a formerly empty container', () => {
  const document = MarkdownImporter.parse('>\n', schema);
  const quote = document.child(0), child = quote.child(0);
  const moved = document.copy([schema.node('blockquote', { dir: 'rtl' }, [child])]);
  const filled = document.copy([quote.copy([child.copy([schema.text('Author text')])])]);
  expect(HTMLExporter.export(moved, reader)).toContain('<p></p>');
  expect(HTMLExporter.export(filled, reader)).toBe('<blockquote><p>Author text</p></blockquote>');
});
