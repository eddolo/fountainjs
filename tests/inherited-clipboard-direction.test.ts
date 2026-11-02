import { expect, it } from 'vitest';
import { Schema, type NodeJSON } from '../src/core';
import { CoreSchemaSpec } from '../src/extensions';
import { snapshotInheritedNodeDirection } from '../src/core/shared-direction';

const p = (text: string, attrs = {}): NodeJSON => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] });
const quote = (content: NodeJSON[], attrs = {}): NodeJSON => ({ type: 'blockquote', attrs, content });

it.each([
  { name: 'fixed RTL', attrs: { dir: 'rtl' }, anchor: 'English', direction: 'rtl', detached: 0 },
  { name: 'fixed LTR', attrs: { dir: 'ltr' }, anchor: 'שלום', direction: 'ltr', detached: 0 },
  { name: 'local automatic RTL', attrs: { dir: 'auto' }, anchor: 'שלום', direction: 'rtl', detached: 1 },
  { name: 'local automatic LTR', attrs: { dir: 'auto' }, anchor: 'English', direction: 'ltr', detached: 1 },
  { name: 'weak automatic fallback', attrs: { dir: 'auto' }, anchor: '123 😀', direction: 'ltr', detached: 1 },
])('snapshots $name without copying unselected text', ({ attrs, anchor, direction, detached }) => {
  const schema = new Schema(CoreSchemaSpec);
  const source = schema.nodeFromJSON({ type: 'doc', content: [quote([p(anchor), p('Copied child')], attrs)] });
  const before = source.toJSON(), child = source.child(0).child(1);
  const result = snapshotInheritedNodeDirection(schema.node('doc', {}, [child]), source, [0, 1])!;
  expect(result.detached).toBe(detached);
  expect(result.document.child(0).attrs).toMatchObject({ dir: direction, align: 'start' });
  expect(result.document.child(0).textContent).toBe('Copied child');
  expect(result.document.child(0).attrs.directionGroup).toBeUndefined();
  expect(source.toJSON()).toEqual(before);
  schema.validate(result.document);
});

it('resolves shared ownership from the complete source, not the selected parent alone', () => {
  const schema = new Schema(CoreSchemaSpec), attrs = { dir: 'auto', directionGroup: 'outside' };
  const source = schema.nodeFromJSON({ type: 'doc', content: [quote([p('שלום anchor')], attrs), quote([p('English child')], attrs)] });
  const result = snapshotInheritedNodeDirection(schema.node('doc', {}, [source.child(1).child(0)]), source, [1, 0])!;
  expect(result.document.child(0).attrs.dir).toBe('rtl');
  expect(result.detached).toBe(1);
});

it.each(['auto', 'ltr', 'rtl'])('does not overwrite selected node own %s boundary', dir => {
  const schema = new Schema(CoreSchemaSpec);
  const source = schema.nodeFromJSON({ type: 'doc', content: [quote([p('Child', { dir })], { dir: 'rtl' })] });
  const selected = schema.node('doc', {}, [source.child(0).child(0)]);
  expect(snapshotInheritedNodeDirection(selected, source, [0, 0])).toEqual({ document: selected, detached: 0 });
});

it('uses the nearest fixed ancestor and retains an authored physical alignment', () => {
  const schema = new Schema(CoreSchemaSpec);
  const source = schema.nodeFromJSON({ type: 'doc', content: [quote([
    quote([p('Child', { align: 'left', alignExplicit: true })], { dir: 'ltr' }),
  ], { dir: 'rtl' })] });
  const result = snapshotInheritedNodeDirection(schema.node('doc', {}, [source.child(0).child(0).child(0)]), source, [0, 0, 0])!;
  expect(result.document.child(0).attrs).toMatchObject({ dir: 'ltr', align: 'left', alignExplicit: true });
  expect(result.detached).toBe(0);
});

it('keeps a capable inline selection inside a direction-carrying paragraph', () => {
  const schema = new Schema(CoreSchemaSpec);
  const source = schema.nodeFromJSON({ type: 'doc', content: [quote([p('Child')], { dir: 'rtl' })] });
  const selected = schema.node('doc', {}, [schema.node('paragraph', {}, [source.child(0).child(0).child(0)])]);
  const result = snapshotInheritedNodeDirection(selected, source, [0, 0, 0])!;
  expect(result.document.child(0).attrs.dir).toBe('rtl');
  expect(result.document.textContent).toBe('Child');
});

it.each([true, false])('requires a representable boundary for custom blocks (neutral scope: %s)', capable => {
  const { direction_scope: _, ...withoutScope } = CoreSchemaSpec.nodes;
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...(capable ? CoreSchemaSpec.nodes : withoutScope),
    opaque: { group: 'block', atom: true, attrs: { value: { default: 'unchanged' } } },
  } });
  const source = schema.nodeFromJSON({ type: 'doc', content: [quote([{ type: 'opaque' }], { dir: 'rtl' })] });
  const node = source.child(0).child(0), selected = schema.node('doc', {}, [node]);
  const result = snapshotInheritedNodeDirection(selected, source, [0, 0]);
  if (!capable) expect(result).toBeNull();
  else {
    expect(result!.document.child(0).type.name).toBe('direction_scope');
    expect(result!.document.child(0).attrs.dir).toBe('rtl');
    expect(result!.document.child(0).child(0)).toBe(node);
    schema.validate(result!.document);
  }
});

it('leaves a node with no declared ancestor direction unchanged', () => {
  const schema = new Schema(CoreSchemaSpec), source = schema.nodeFromJSON({ type: 'doc', content: [quote([p('Child')])] });
  const selected = schema.node('doc', {}, [source.child(0).child(0)]);
  expect(snapshotInheritedNodeDirection(selected, source, [0, 0])).toEqual({ document: selected, detached: 0 });
});
