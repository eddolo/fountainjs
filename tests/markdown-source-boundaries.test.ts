import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema } from '../src';

describe('parser-owned Markdown source boundaries', () => {
  it.each(['\n', '\r\n', '\r'])('preserves adjacent heading spelling around an edit (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['# Keep this heading ###', 'Edit this paragraph.', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(0),
      schema.node('paragraph', {}, [schema.text('Changed paragraph.')])]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(imported.source.blocks.map(block => block.source)).toEqual(['# Keep this heading ###', 'Edit this paragraph.']);
    expect(result.markdown).toBe(source.replace('Edit this paragraph.', 'Changed paragraph.'));
    expect(result.preservation).toBe('blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it.each(['\n', '\r\n', '\r'])('keeps an entire blank-containing fence when a neighbour changes (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['Edit.', '', '~~~~typescript', 'const first = 1;', '', '[reference]: ./literal.md', '',
      'const last = 2;', '~~~~', '', 'Last __untouched__ paragraph.', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed.')]), ...imported.document.content.slice(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(result.preservation).toBe('blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('inserts a necessary separator when a heading becomes a paragraph', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Original ###\nFollowing __source__.\n', schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed type.')]), imported.document.child(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('Changed type.\n\nFollowing __source__.\n');
    expect(result.preservation).toBe('blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('keeps loose list source, nested quotes and fences around an unrelated edit', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['Edit.', '', '*   First __source__ item', '', '*   Second item', '',
      '    > quoted _source_', '    >', '    > ~~~text', '    > first', '    >', '    > last', '    > ~~~', '',
      'After __source__.', ''].join('\n');
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed.')]), ...imported.document.content.slice(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(result.preservation).toBe('blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('retains parser-owned code regions during structural moves', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '~~~~js\nfirst\n\nlast\n~~~~\n\n# Keep ###\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(1), imported.document.child(0)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('# Keep ###\n\n~~~~js\nfirst\n\nlast\n~~~~');
    expect(result.preservation).toBe('mapped-blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it.each(['\n', '\r\n', '\r'])('retains indented code with internal blank lines and exact tabs (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['# Keep ###', 'Edit.', '', '\tfirst', '', '\tlast', '', 'After __source__.', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(0), schema.node('paragraph', {}, [schema.text('Changed.')]), ...imported.document.content.slice(2)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('uses original immutable identities without guessing between equal cloned headings', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Same ###\n# Same\n\n~~~~js\nfirst\n\nlast\n~~~~\n', schema);
    const inserted = schema.node('paragraph', {}, [schema.text('Inserted.')]);
    const moved = schema.node('doc', {}, [inserted, imported.document.child(1), imported.document.child(0), imported.document.child(2)]);
    const result = MarkdownExporter.exportWithSource(moved, imported.source);
    expect(result.markdown).toBe('Inserted.\n\n# Same\n\n# Same ###\n\n~~~~js\nfirst\n\nlast\n~~~~');
    const cloned = schema.node('doc', {}, [inserted, schema.nodeFromJSON(imported.document.child(1).toJSON()),
      schema.nodeFromJSON(imported.document.child(0).toJSON()), imported.document.child(2)]);
    const ambiguous = MarkdownExporter.exportWithSource(cloned, imported.source);
    expect(ambiguous.markdown).toBe('Inserted.\n\n# Same\n\n# Same\n\n~~~~js\nfirst\n\nlast\n~~~~');
    expect(MarkdownImporter.parse(ambiguous.markdown, schema).toJSON()).toEqual(cloned.toJSON());
  });

  it('uses the original literal-address policy while checking adjacent blocks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const options = { autolinkLiterals: false };
    const source = '# Heading ###\nwww.example.com\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed type.')]), imported.document.child(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('Changed type.\n\nwww.example.com\n');
    expect(MarkdownImporter.parse(result.markdown, schema, options).toJSON()).toEqual(changed.toJSON());
  });

  it('does not assign source ownership to an external one-to-many HTML projection', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = 'Edit.\n\n<div>\n\nRaw\n\n</div>\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLBlock: () => [schema.node('paragraph', {}, [schema.text('First projection')]),
        schema.node('paragraph', {}, [schema.text('Second projection')])],
    });
    expect(imported.source.blocks).toEqual([]);
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
  });

  it('closes a moved EOF-open fence without rewriting the untouched heading source', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Keep ###\n\n~~~~js\nfirst\n\nlast\n', schema);
    const changed = schema.node('doc', {}, [imported.document.child(1), imported.document.child(0)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('```js\nfirst\n\nlast\n```\n\n# Keep ###');
    expect(result.preservation).toBe('mapped-blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('closes an EOF-open fence before a newly appended block', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Keep ###\n\n~~~~js\nfirst\n\nlast\n', schema);
    const changed = schema.node('doc', {}, [...imported.document.content,
      schema.node('paragraph', {}, [schema.text('A new ending.')])]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('# Keep ###\n\n```js\nfirst\n\nlast\n```\n\nA new ending.');
    expect(result.preservation).toBe('mapped-blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('also checks an EOF-open fence whose source has no internal blank lines', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Keep ###\n\n~~~~js\nfirst\n', schema);
    const changed = schema.node('doc', {}, [imported.document.child(1), imported.document.child(0)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('```js\nfirst\n```\n\n# Keep ###');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('does not merge separate same-marker lists after deleting their separator block', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('*   First __source__ item\n\n# Keep ###\n\n*   Second __source__ item\n', schema);
    const changed = schema.node('doc', {}, [imported.document.child(1), imported.document.child(0), imported.document.child(2)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toContain('# Keep ###');
    expect(result.markdown).toContain('*   Second __source__ item');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('does not merge two indented code buffers after moving them next to each other', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('    first\n\n# Keep ###\n\n    second\n', schema);
    const changed = schema.node('doc', {}, [imported.document.child(1), imported.document.child(0), imported.document.child(2)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('# Keep ###\n\n```text\nfirst\n```\n\n    second');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it.each([
    ['minus lists', '- First __source__ item\n\n# Keep ###\n\n- Second __source__ item\n'],
    ['dot lists', '1. First __source__ item\n\n# Keep ###\n\n3. Second __source__ item\n'],
  ])('retains the heading source while separating adjacent %s', (_name, source) => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(1), imported.document.child(0), imported.document.child(2)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('mapped-blocks');
    expect(result.markdown).toContain('# Keep ###');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it.each([
    ['bullet lists', '- First\n\n# Keep ###\n\n- Second\n\nAfter.\n'],
    ['ordered lists', '1. First\n\n# Keep ###\n\n3. Second\n\nAfter.\n'],
    ['indented code', '    first\n\n# Keep ###\n\n    second\n\nAfter.\n'],
    ['open fence', '# Keep ###\n\nBefore.\n\n~~~~js\nfirst\n\nlast\n'],
    ['literal HTML', '# Keep ###\n\n<script>\nconst data = 1;\n</script>\n\n> Quote.\n'],
    ['adjacent blocks', '# Keep ###\nBefore.\n\n~~~~text\nfirst\n\nlast\n~~~~\n'],
  ])('preserves full document semantics for every permutation of %s', (_name, source) => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const orders = (indexes: readonly number[]): number[][] => indexes.length < 2 ? [[...indexes]]
      : indexes.flatMap(index => orders(indexes.filter(other => other !== index)).map(rest => [index, ...rest]));
    for (const order of orders(imported.document.content.map((_, index) => index))) {
      const changed = schema.node('doc', {}, order.map(index => imported.document.child(index)));
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON(), `${_name}: ${order.join(',')}`).toEqual(changed.toJSON());
    }
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
  });
});
