import { expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, MarkdownSourceSnapshot, Schema, createEditor, ensureTrailingEditableBlocks } from '../src';

it('binds exact source to a different external dialect without reparsing it into the Fountain dialect', () => {
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    reference: { inline: true, group: 'inline', atom: true, attrs: { original: {}, label: {} }, toText: node => String(node.attrs.label) },
  } });
  const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('See '), schema.node('reference', { original: '#1', label: 'Issue one (closed)' })])]);
  const raw = 'See #1  \r\n\r\n';
  const source = MarkdownSourceSnapshot.capture(raw, document);
  expect(MarkdownExporter.exportWithSource(document, source)).toEqual({ markdown: raw, preservation: 'exact', losses: [] });
  expect(source.matches(document.copy())).toBe(true);
  expect(source.blocks).toEqual([]);
  expect(source.mapBlocks(document)).toBeNull();
  expect(Object.isFrozen(source)).toBe(true);
});

it('uses canonical edited output without claiming untouched block or frontmatter retention', () => {
  const schema = new Schema(CoreSchemaSpec);
  const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Original')])]);
  const source = MarkdownSourceSnapshot.capture('---\ntitle: External dialect\n---\n\nOriginal\n', document);
  expect(source.frontmatter).toBeUndefined();
  const edited = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed')])]);
  expect(MarkdownExporter.exportWithSource(edited, source)).toEqual({ markdown: 'Changed', preservation: 'canonical', losses: [] });
});

it('requires a valid root from a Fountain schema before binding source', () => {
  const schema = new Schema(CoreSchemaSpec);
  expect(() => MarkdownSourceSnapshot.capture('Bad', schema.node('paragraph'))).toThrow('complete Fountain document');
  const invalid = schema.topNodeType.create({}, [schema.text('Not a block')]);
  expect(() => MarkdownSourceSnapshot.capture('Bad', invalid)).toThrow();
  expect(() => MarkdownSourceSnapshot.capture(null as unknown as string, schema.node('doc', {}, [schema.node('paragraph')]))).toThrow('string');
});

it('distinguishes a live automatic caret repair from an authored empty paragraph', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [{ type: 'horizontal_rule' }] } });
  try {
    const original = editor.state.doc, source = MarkdownSourceSnapshot.capture('***\r\n', original);
    expect(ensureTrailingEditableBlocks(editor)).toBe(true);
    expect(MarkdownExporter.exportWithSource(editor.state.doc, source).preservation).toBe('exact');
    const authored = original.copy([...original.content, editor.state.schema.node('paragraph', {}, [editor.state.schema.text('')])]);
    expect(source.matches(authored)).toBe(false);
  } finally { editor.destroy(); }
});
