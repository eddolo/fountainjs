import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema, type Node } from '../src';

const replace = (node: Node, path: readonly number[], value: Node): Node => !path.length ? value
  : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));
const at = (node: Node, path: readonly number[]): Node => path.reduce((value, index) => value.child(index), node);
const cases = [
  { name: 'quote-leading', lines: ['> [ref]: /target "Original title"', '>', '> First __source__ [link][ref].', '>', '  > Edit.', '>', ' > Last _source_ [ref].'], path: [1, 1] },
  { name: 'quote-trailing', lines: ['> First __source__ [link][ref].', '>', '  > Edit.', '>', ' > Last _source_ [ref].', '>', '> [ref]: /target "Original title"'], path: [1, 1] },
  { name: 'list', lines: ['*   [ref]: /target "Original title"', '', '    First __source__ [link][ref].', '', '    Edit.', '', '    Last _source_ [ref].', '', '*   Tail.'], path: [1, 0, 1] },
  { name: 'ordered', lines: ['7) [ref]: /target "Original title"', '', '   First __source__ [link][ref].', '', '   Edit.', '', '   Last _source_ [ref].', '', '11) Tail.'], path: [1, 0, 1] },
  { name: 'list-in-quote', lines: ['> *   [ref]: /target "Original title"', '>', '>     First __source__ [link][ref].', '>', '>     Edit.', '>', '>     Last _source_ [ref].', '>', '> *   Tail.'], path: [1, 0, 0, 1] },
  { name: 'quote-in-list', lines: ['*   > [ref]: /target "Original title"', '    >', '    > First __source__ [link][ref].', '    >', '    > Edit.', '    >', '    > Last _source_ [ref].'], path: [1, 0, 0, 1] },
];

describe('source ownership for container-carried shared definitions', () => {
  for (const ending of ['\n', '\r\n', '\r']) {
    it.each(cases)(`retains $name source and cross-block references (${JSON.stringify(ending)})`, ({ lines, path }) => {
      const schema = new Schema(CoreSchemaSpec);
      const source = ['# Keep [link][ref] ###', '', ...lines, '', 'After [link][ref].', ''].join(ending);
      const imported = MarkdownImporter.parseWithSource(source, schema);
      expect(at(imported.document, path).textContent).toBe('Edit.');
      const changed = replace(imported.document, path, schema.node('paragraph', {}, [schema.text('Changed.')]));
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
      expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    });

    it.each(['move', 'delete', 'replace'] as const)(`keeps external links after %s of a defining container (${JSON.stringify(ending)})`, action => {
      const schema = new Schema(CoreSchemaSpec);
      const source = ['# Keep [link][ref] ###', '', '> [ref]: /target "Original title"', '>', '> Visible __source__.', '', 'After [link][ref].', ''].join(ending);
      const imported = MarkdownImporter.parseWithSource(source, schema), [heading, owner, after] = imported.document.content;
      const changed = imported.document.copy(action === 'move' ? [owner, heading, after] : action === 'delete' ? [heading, after]
        : [heading, schema.node('paragraph', {}, [schema.text('Replacement.')]), after]);
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
      expect(result.markdown).toContain('# Keep [link][ref] ###');
    });
  }

  it('keeps global first-definition precedence when moving conflicting containers', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '# Keep [link][ref] ###\n\n> [ref]: /first "First"\n>\n> First owner.\n\n*   [ref]: /ignored "Ignored"\n\n    Second owner.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema), [heading, first, second] = imported.document.content;
    const changed = imported.document.copy([heading, second, first]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('does not expose a newly typed definition as source-owned trivia', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '# Keep [link][ref] ###\n\n> [ref]: /target "Keep"\n>\n> Edit.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [1, 0], schema.node('paragraph', {}, [schema.text('[ref]: /evil "Changed"')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  for (const ending of ['\n', '\r\n', '\r']) {
    it(`retains multiline Unicode definitions, ignored duplicates and opaque code (${JSON.stringify(ending)})`, () => {
      const schema = new Schema(CoreSchemaSpec);
      const source = ['# Keep [link][STRASSE] ###', '', '> [Straße]:', '>   </target?q=a&b=c>', '>   "Original title"', '>',
        '> First __source__ [link][STRASSE].', '>', '> Edit.', '>', '> ~~~~text', '> [Straße]: /fake "Code only"', '> ~~~~', '',
        '[STRASSE]: /ignored "Ignored"', '', 'After [link][STRASSE].', ''].join(ending);
      const imported = MarkdownImporter.parseWithSource(source, schema);
      const changed = replace(imported.document, [1, 1], schema.node('paragraph', {}, [schema.text('Changed.')]));
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
      const withoutOwner = imported.document.copy([imported.document.child(0), imported.document.child(2)]);
      const removed = MarkdownExporter.exportWithSource(withoutOwner, imported.source);
      expect(MarkdownImporter.parse(removed.markdown, schema).toJSON()).toEqual(withoutOwner.toJSON());
      expect(removed.markdown).not.toContain('/fake');
    });

    it(`retains task state while preserving a defining item's source (${JSON.stringify(ending)})`, () => {
      const schema = new Schema(CoreSchemaSpec);
      const source = ['# Keep [link][ref] ###', '', '- [ ] Review __source__ [proof][ref].', '', '  [ref]: /target "Original"',
        '', '- [X] Done _source_.', '', 'After [link][ref].', ''].join(ending);
      const imported = MarkdownImporter.parseWithSource(source, schema), item = imported.document.child(1).child(0);
      expect(item.child(0).type.name).toBe('paragraph');
      expect(item.child(0).content.some(node => node.text === 'proof' && node.marks.some(mark => mark.type.name === 'link' && mark.attrs.href === '/target'))).toBe(true);
      const changed = replace(imported.document, [1, 0], item.withAttrs({ ...item.attrs, checked: true }));
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(result.markdown).toBe(source.replace('[ ]', '[x]'));
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
    });
  }

  it('preserves loss reports when a defining container gets an unrepresentable attribute', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Keep [link][ref] ###\n\n> [ref]: /target\n>\n> Edit.\n', schema);
    const paragraph = imported.document.child(1).child(0);
    const changed = replace(imported.document, [1, 0], paragraph.withAttrs({ ...paragraph.attrs, align: 'center' }));
    const losses: unknown[] = [];
    const result = MarkdownExporter.exportWithSource(changed, imported.source, { onLoss: loss => losses.push(loss) });
    expect(result.preservation).toBe('canonical');
    expect(result.losses).toEqual(losses);
    expect(result.losses.filter(loss => loss.type === 'paragraph' && loss.detail.includes('alignment'))).toHaveLength(1);
  });
});
