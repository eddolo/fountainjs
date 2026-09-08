import { describe, expect, it } from 'vitest';
import { CoreExtension, Schema, composeExtensions, MarkdownExporter, MarkdownImporter } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import githubEscapes from './fixtures/markdown/github-escape-interactions-v1.json';

const schema = new Schema(composeExtensions([CoreExtension]).schema);

describe('Markdown content/format/container combinations', () => {
  it.each(githubEscapes.cases)('matches captured GitHub content and structure: $markdown', ({ markdown, html }) => {
    // Both paths project into Fountain's schema. GitHub's accessibility wrapper,
    // role and code class are presentation metadata, not document semantics.
    const expected = ServerHTMLImporter.parse(html, schema);
    const actual = MarkdownImporter.parse(markdown, schema);
    expect(actual.toJSON()).toEqual(expected.toJSON());
  });
  it.each([
    'a|b', 'a\\|b', '|', 'a  b', 'a\tb', '**bold**', 'a\nb', 'a\r\nb',
    'a`b', 'a\\b', 'www.example.com', 'foo@example.com', ' a ', '[x]', '&#10;',
    '<br>', '~~x~~', '==x==', '$x$', 'https://example.com/a_b?q=x&y=1',
  ])('retains %j across seven marks and three containers', text => {
    for (const kind of ['paragraph', 'heading', 'table']) {
      for (const mark of ['', 'strong', 'em', 'code', 'strike', 'highlight', 'link']) {
        const marks = mark ? [schema.mark(mark, mark === 'link' ? { href: 'https://example.com' } : {})] : [];
        const paragraph = schema.node('paragraph', {}, [schema.text(text, marks)]);
        const block = kind === 'heading' ? schema.node('heading', { level: 2 }, paragraph.content)
          : kind === 'table' ? schema.node('table', {}, [
            schema.node('table_row', {}, [schema.node('table_header', {}, [paragraph])]),
            schema.node('table_row', {}, [schema.node('table_cell', {}, [paragraph])]),
          ]) : paragraph;
        const doc = schema.node('doc', {}, [block]);
        const output = MarkdownExporter.exportWithReport(doc);
        const label = JSON.stringify({ text, kind, mark, markdown: output.markdown });
        expect(output.losses, label).toEqual([]);
        expect(MarkdownImporter.parse(output.markdown, schema).toJSON(), label).toEqual(doc.toJSON());
      }
    }
  });

  // GitHub GFM renderer checked 2026-09-08: every positive backslash run
  // protects the pipe at the table layer; exactly its last slash is removed.
  // Code keeps the rest literal, while ordinary inline text then decodes pairs.
  it.each([1, 2, 3, 4, 5, 6])('retains a pipe protected by %i backslashes in table cells', count => {
    const code = '`a' + '\\'.repeat(count) + '|b`';
    const doc = MarkdownImporter.parse(`| ${code} | other |\n| --- | --- |\n| ${code} | next |`, schema);
    const table = doc.child(0);
    expect(table.type.name).toBe('table');
    for (const row of table.content) {
      expect(row.childCount).toBe(2);
      expect(row.child(0).textContent).toBe('a' + '\\'.repeat(count - 1) + '|b');
      expect(row.child(0).child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['code']);
    }
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it('does not mistake a protected terminal pipe for a table border', () => {
    const doc = MarkdownImporter.parse('| Left | Right\n| --- | ---\n| cell | end\\\\|', schema);
    const table = doc.child(0);
    expect(table.child(1).child(1).textContent).toBe('end|');
    expect(table.child(1).childCount).toBe(2);
  });

  it('does not use a protected pipe as a header cell separator', () => {
    const doc = MarkdownImporter.parse('a\\\\|b\n:---', schema);
    expect(doc.child(0).type.name).toBe('paragraph');
  });

  it.each([
    [String.raw`~~\~\~x\~\~~~`, '~~x~~'],
    [String.raw`\~~~x~~`, '~x'],
    [String.raw`~\~x\~~`, '~x~'],
  ])('distinguishes escaped tildes from adjacent delimiter runs: %s', (source, text) => {
    const doc = MarkdownImporter.parse(source, schema);
    expect(doc.textContent).toBe(text);
    expect(doc.child(0).content.some(node => node.marks.some(mark => mark.type.name === 'strike'))).toBe(true);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });
});
