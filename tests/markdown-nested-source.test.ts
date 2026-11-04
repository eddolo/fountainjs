import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema, StarterKit, composeExtensions, createEditor, EditorState, type Node } from '../src';

function replace(node: Node, path: readonly number[], value: Node): Node {
  if (!path.length) return value;
  return node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));
}

describe('nested Markdown source ownership', () => {
  it.each(['\n', '\r\n', '\r'])('keeps untouched loose list items literal after editing another item (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['*   First __source__ item', '', '*   Edit.', '', '*   Last _source_ item', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 1, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(result.preservation).toBe('blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
  });

  it.each(['\n', '\r\n', '\r'])('keeps quote prefixes and unrelated paragraphs literal (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['> First __source__.', '>', '  > Edit.', '>', ' > Last _source_.', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 1], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(result.preservation).toBe('blocks');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('retains nonsequential ordered markers when only text changes', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '7) First __source__.\n9) Edit.\n11) Last _source_.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 1, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('changes a task checkbox without rewriting item source or the other checkbox spelling', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '- [ ] First __source__.\n- [X] Last _source_.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const item = imported.document.child(0).child(0);
    const changed = replace(imported.document, [0, 0], item.withAttrs({ ...item.attrs, checked: true }));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('- [ ]', '- [x]'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('retains a list inside a quote and untouched quoted paragraphs', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '> *   First __source__.\n> *   Edit.\n>\n> Tail _source_.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 0, 1, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('retains a blank-containing fence and another paragraph inside the same list item', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '*   First __source__.\n\n    Edit.\n\n    ~~~~js\n    first\n\n    last\n    ~~~~\n\n*   Last _source_.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 0, 1], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('inserts a required quoted blank line after changing an adjacent heading to a paragraph', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '> # Original ###\n> Following __source__.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 0], schema.node('paragraph', {}, [schema.text('Changed type.')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('> Changed type.\n> \n> Following __source__.\n');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('maps a lazy continuation without rewriting later quote markers', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '> First __source__.\n>\n> Edit.\ncontinued here\n>\n > Last _source_.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 1], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.\ncontinued here', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('preserves first-line tab padding and uses valid continuation indentation for new hard breaks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '-\tEdit.\n-\tLast __source__.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 0, 0], schema.node('paragraph', {}, [schema.text('First'),
      schema.node('hard_break'), schema.text('Second')]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe('-\tFirst  \n    Second\n-\tLast __source__.\n');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('does not drop changes to an unrepresentable paragraph attribute while retaining source', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('*   First __source__.\n*   Last _source_.\n', schema);
    const paragraph = imported.document.child(0).child(0).child(0);
    const changed = replace(imported.document, [0, 0, 0], paragraph.withAttrs({ ...paragraph.attrs, align: 'center' }));
    const losses: unknown[] = [];
    const result = MarkdownExporter.exportWithSource(changed, imported.source, { onLoss: loss => losses.push(loss) });
    expect(result.preservation).toBe('canonical');
    expect(result.losses).toEqual(losses);
    expect(result.losses.filter(loss => loss.type === 'paragraph' && loss.detail.includes('alignment'))).toHaveLength(1);
  });

  it('keeps reference-style generation on the canonical path without leaking speculative definitions', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '*   First __source__.\n*   Last _source_.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = replace(imported.document, [0, 0, 0], schema.node('paragraph', {}, [schema.text('Link', [
      schema.marks.link.create({ href: 'https://example.com', title: '' }),
    ])]));
    const result = MarkdownExporter.exportWithSource(changed, imported.source, { linkStyle: 'reference' });
    expect(result.preservation).toBe('canonical');
    expect(result.markdown.match(/\[ref-1\]:/g)).toHaveLength(1);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('retains nested source in the real editor while preserving its automatic trailing paragraph', () => {
    const kit = composeExtensions(StarterKit.extensions);
    const schema = new Schema(kit.schema);
    const imported = MarkdownImporter.parseWithSource('*   Edit.\n*   Last _source_.\n', schema);
    const editor = createEditor({ schema: kit.schema, state: EditorState.create({ schema, doc: imported.document, plugins: kit.plugins }) });
    try {
      expect(editor.state.doc.childCount).toBe(2);
      editor.dispatch(editor.state.createTransaction().insertText([0, 0, 0, 0], 0, 'Changed '));
      const result = MarkdownExporter.exportWithSource(editor.state.doc, imported.source);
      expect(result.preservation).toBe('blocks');
      expect(result.markdown).toContain('*   Changed Edit.');
      expect(result.markdown).toContain('*   Last _source_.');
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(editor.state.doc.toJSON());
    } finally { editor.destroy(); }
  });

  it.each(['authored', 'copied'] as const)('keeps a %s empty trailing paragraph in the exported document', kind => {
    const kit = composeExtensions(StarterKit.extensions);
    const schema = new Schema(kit.schema);
    const imported = MarkdownImporter.parseWithSource('*   Edit.\n*   Last _source_.\n', schema);
    const editor = createEditor({ schema: kit.schema, state: EditorState.create({ schema, doc: imported.document, plugins: kit.plugins }) });
    try {
      const tail = kind === 'authored' ? schema.node('paragraph', {}, [schema.text('')])
        : editor.state.doc.content.at(-1)!.copy([...editor.state.doc.content.at(-1)!.content]);
      const changed = replace(imported.document, [0, 0, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
      const document = changed.copy([...changed.content, tail]);
      const result = MarkdownExporter.exportWithSource(document, imported.source);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
      expect(result.markdown).toContain('Changed.');
    } finally { editor.destroy(); }
  });

  it('uses the original capture for repeated edits without mutating source ownership', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '- [ ] Edit.\n- [X] Last __source__.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const item = imported.document.child(0).child(0);
    const checked = replace(imported.document, [0, 0], item.withAttrs({ ...item.attrs, checked: true }));
    const edited = replace(checked, [0, 0, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const cleared = replace(edited, [0, 0], edited.child(0).child(0).withAttrs({ ...item.attrs, checked: false }));
    for (const [document, expected] of [[checked, source.replace('[ ]', '[x]')],
      [edited, source.replace('[ ]', '[x]').replace('Edit.', 'Changed.')],
      [cleared, source.replace('Edit.', 'Changed.')], [imported.document, source]] as const) {
      const result = MarkdownExporter.exportWithSource(document, imported.source);
      expect(result.markdown).toBe(expected);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
    }
  });

  it.each(['insert', 'delete', 'start'] as const)('retains semantics after a list %s changes its source-owned structure', action => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('7) First __source__.\n9) Last _source_.\n', schema);
    const list = imported.document.child(0);
    const changedList = action === 'start' ? list.withAttrs({ ...list.attrs, start: 3 })
      : list.copy(action === 'delete' ? [list.child(0)] : [...list.content,
        schema.node('list_item', {}, [schema.node('paragraph', {}, [schema.text('New item.')])])]);
    const changed = replace(imported.document, [0], changedList);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });
});
