import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema, type Node } from '../src';

const replace = (node: Node, path: readonly number[], value: Node): Node => !path.length ? value
  : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));

const cases: readonly { name: string; lines: readonly string[]; path: readonly number[] }[] = [
  { name: 'tight bullet list', lines: ['*   First __source__ [link][ref].', '*   Edit.', '*   Last _source_ [ref].'], path: [0, 1, 0] },
  { name: 'loose bullet list', lines: ['*   First __source__ [link][ref].', '', '*   Edit.', '', '*   Last _source_ [ref].'], path: [0, 1, 0] },
  { name: 'nonsequential ordered list', lines: ['7) First __source__ [link][ref].', '', '9) Edit.', '', '11) Last _source_ [ref].'], path: [0, 1, 0] },
  { name: 'quote', lines: ['> First __source__ [link][ref].', '>', '  > Edit.', '>', ' > Last _source_ [ref].'], path: [0, 1] },
  { name: 'list in quote', lines: ['> *   First __source__ [link][ref].', '> *   Edit.', '>', ' > Last _source_ [ref].'], path: [0, 0, 1, 0] },
  { name: 'quote in list', lines: ['*   > First __source__ [link][ref].', '    >', '    > Edit.', '    >', '    > Last _source_ [ref].'], path: [0, 0, 0, 1] },
];

describe('nested source with shared reference definitions', () => {
  for (const ending of ['\n', '\r\n', '\r']) for (const position of ['before', 'after']) {
    it.each(cases)(`retains $name source with ${position} definitions (${JSON.stringify(ending)})`, ({ lines, path }) => {
      const schema = new Schema(CoreSchemaSpec);
      const definitions = '[ref]: /target "Original title"';
      const body = lines.join(ending);
      const source = (position === 'before' ? definitions + ending + ending + body : body + ending + ending + definitions) + ending;
      const imported = MarkdownImporter.parseWithSource(source, schema);
      const changed = replace(imported.document, path, schema.node('paragraph', {}, [schema.text('Changed.')]));
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
      expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    });
  }

  it.each(['\n', '\r\n', '\r'])('retains checkboxes and duplicate definition precedence (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['[ref]: /first "First"', '', '- [ ] First __source__ [link][ref].', '- [X] Last _source_ [ref].', '', '[ref]: /ignored "Ignored"', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema), item = imported.document.child(0).child(0);
    const checked = replace(imported.document, [0, 0], item.withAttrs({ ...item.attrs, checked: true }));
    const result = MarkdownExporter.exportWithSource(checked, imported.source);
    expect(result.markdown).toBe(source.replace('[ ]', '[x]'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(checked.toJSON());
  });

  it('does not let edited definition-like text change other reference destinations', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '[ref]: /original "Keep"\n\n> First [link][ref].\n>\n> Edit.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 1], schema.node('paragraph', {}, [schema.text('[ref]: /evil "Changed"')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
    expect(result.markdown).toContain('[ref]: /original "Keep"');
  });

  it('keeps complete equality and loss reporting when a nested attribute cannot be represented', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('[ref]: /target\n\n> First __source__ [link][ref].\n>\n> Edit.\n', schema);
    const paragraph = imported.document.child(0).child(1);
    const changed = replace(imported.document, [0, 1], paragraph.withAttrs({ ...paragraph.attrs, align: 'center' }));
    const losses: unknown[] = [];
    const result = MarkdownExporter.exportWithSource(changed, imported.source, { onLoss: loss => losses.push(loss) });
    expect(result.preservation).toBe('canonical');
    expect(result.losses).toEqual(losses);
    expect(result.losses.filter(loss => loss.type === 'paragraph' && loss.detail.includes('alignment'))).toHaveLength(1);
  });

  for (const ending of ['\n', '\r\n', '\r']) {
    it.each(['move', 'append', 'delete-heading'] as const)(`keeps parser-captured reference scope after %s (${JSON.stringify(ending)})`, action => {
      const schema = new Schema(CoreSchemaSpec);
      const source = ['[ref]: /target "Original"', '', '# Keep [link][ref] ###', '## Adjacent ###',
        '*   First __source__.', '', '*   Last _source_.', '', '~~~~js', 'first', ''].join(ending);
      const imported = MarkdownImporter.parseWithSource(source, schema);
      expect(imported.source.blocks).toHaveLength(4);
      const [heading, adjacent, list, code] = imported.document.content;
      const changed = imported.document.copy(action === 'move' ? [code, heading, adjacent, list]
        : action === 'append' ? [...imported.document.content, schema.node('paragraph', {}, [schema.text('Appended.')])]
          : [adjacent, list, code]);
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
      expect(result.markdown).toContain('## Adjacent ###');
      if (action !== 'delete-heading') expect(result.markdown).toContain('# Keep [link][ref] ###');
    });

    it(`declines ownership when a container carries a shared definition (${JSON.stringify(ending)})`, () => {
      const schema = new Schema(CoreSchemaSpec);
      const source = ['[ref]: /first "First"', '', '> [ref]: /ignored "Ignored"', '>', '> Edit.', '', 'Keep [link][ref].', ''].join(ending);
      const imported = MarkdownImporter.parseWithSource(source, schema);
      const changed = replace(imported.document, [0, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(result.preservation).toBe('canonical');
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
    });
  }
});
