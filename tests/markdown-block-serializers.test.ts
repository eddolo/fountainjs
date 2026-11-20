import { expect, it } from 'vitest';
import { CoreSchemaSpec, Schema, MarkdownExporter } from '../src';
const schema = new Schema({ ...CoreSchemaSpec, marks:{...CoreSchemaSpec.marks, keyboard:{}}, nodes: { ...CoreSchemaSpec.nodes,
  custom: { group: 'block', content: 'text*' },
  badge: { group: 'inline', inline: true, atom: true, attrs: { key: { default: 'team' } } },
} });
const custom = schema.node('custom', {}, [schema.text('source')]);
const render = new MarkdownExporter();
const serializers = { custom: () => '```custom\nsource\n```' };
it('lets existing list/quote writers indent custom syntax and preserves fallback loss reporting', () => {
  const node = schema.node('doc', {}, [schema.node('blockquote', {}, [schema.node('bullet_list', {}, [schema.node('list_item', {}, [custom])])])]);
  const output = render.exportWithReport(node, { blockSerializers: serializers });
  expect(output.losses).toEqual([]);
  expect(output.markdown).toBe('> - ```custom\n>   source\n>   ```');
  expect(render.exportWithReport(node, { blockSerializers: { custom: () => undefined } }).losses).toContainEqual(expect.objectContaining({ kind: 'node', type: 'custom' }));
});
it('uses an inline writer for a marked atom, its own fragment and a pipe-table cell', () => {
  const atom = schema.node('badge');
  const options = {inlineSerializers:{badge:() => 'team|ops'}};
  expect(render.exportWithReport(atom, options)).toEqual({markdown:'team|ops', losses:[]});
  const paragraph = schema.node('paragraph', {}, [atom.withMarks([schema.mark('strong')])]);
  expect(render.exportWithReport(paragraph, options)).toEqual({markdown:'**team|ops**', losses:[]});
  const header = schema.node('table_header', {}, [paragraph]);
  const table = schema.node('table', {}, [schema.node('table_row', {}, [header])]);
  expect(render.exportWithReport(table, options).markdown).toContain('**team\\|ops**');
  expect(render.exportWithReport(atom, {inlineSerializers:{badge:() => undefined}}).losses).toContainEqual(expect.objectContaining({type:'badge'}));
});
it('keeps one extension mark across text, a hard break and nested bold text', () => {
  const key = schema.mark('keyboard');
  const options = {markSerializers:{keyboard:() => ({open:'<kbd>',close:'</kbd>'})}};
  const paragraph = schema.node('paragraph', {}, [schema.text('A', [key]), schema.node('hard_break').withMarks([key]),
    schema.text('B', [key, schema.mark('strong')]), schema.text('C', [key])]);
  expect(render.exportWithReport(paragraph, options)).toEqual({markdown:'<kbd>A  \n**B**C</kbd>',losses:[]});
  const literal = schema.text('X', [schema.mark('code'), key]);
  expect(render.exportWithReport(literal, options).losses).toContainEqual(expect.objectContaining({kind:'mark',type:'keyboard'}));
});
it('does not execute an inherited serializer', () => {
  const output = render.exportWithReport(custom, { blockSerializers: Object.create(serializers) });
  expect(output.markdown).toBe('source');
  expect(output.losses).toHaveLength(1);
});
it('propagates refused conversions rather than returning partially generated content', () => {
  expect(() => render.exportWithReport(custom, { blockSerializers: { custom: () => { throw new Error('unsupported'); } } })).toThrow('unsupported');
});
