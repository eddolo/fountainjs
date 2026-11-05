import { expect, it } from 'vitest';
import { CoreSchemaSpec, Schema, StarterKit, textPointToPosition, type NodeJSON } from '../src';
import { extractDocumentRange } from '../src/core/transaction/document-fragment';

const schema = new Schema(StarterKit.schema);
const p = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const image: NodeJSON = { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure', title: 'Retained title' } };

it('copies partial text and a whole final image without including preceding text', () => {
  const before = schema.nodeFromJSON({ type: 'doc', attrs: { audit: 'root metadata' }, content: [p('Left'), image] });
  const fragment = extractDocumentRange(before, 3, 8);
  expect(fragment.child(0).textContent).toBe('ft');
  expect(fragment.child(1)).toBe(before.child(1));
  expect(fragment.attrs).toEqual(before.attrs);
  expect(before.child(0).textContent).toBe('Left');
});

it('copies a whole leading image and clips the last text endpoint', () => {
  const before = schema.nodeFromJSON({ type: 'doc', content: [image, p('Right')] });
  const fragment = extractDocumentRange(before, 0, 6);
  expect(fragment.child(0)).toBe(before.child(0));
  expect(fragment.child(1).textContent).toBe('Rig');
});

it('copies an image-only gap range without inventing surrounding text', () => {
  const before = schema.nodeFromJSON({ type: 'doc', content: [p('Before'), image, p('After')] });
  const fragment = extractDocumentRange(before, 8, 10);
  expect(fragment.childCount).toBe(1);
  expect(fragment.child(0)).toBe(before.child(1));
});

it('retains clipped edge marks and attributes on selected quote content', () => {
  const before = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'blockquote', attrs: { dir: 'rtl' }, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Left', marks: [{ type: 'strong' }] }] }, image,
  ] }, p('Outside')] });
  const from = textPointToPosition(before, [0, 0, 0], 2);
  const fragment = extractDocumentRange(before, from, 9);
  expect(fragment.childCount).toBe(1);
  expect(fragment.child(0).attrs.dir).toBe('rtl');
  expect(fragment.child(0).child(0).textContent).toBe('ft');
  expect(fragment.child(0).child(0).child(0).marks[0]?.type.name).toBe('strong');
  expect(fragment.child(0).child(1)).toBe(before.child(0).child(1));
});

it('rejects an unrepresentable custom open fragment rather than adding unselected source', () => {
  const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    pair: { group: 'block', content: 'paragraph paragraph' },
  } });
  const before = custom.nodeFromJSON({ type: 'doc', content: [{ type: 'pair', content: [p('Selected'), p('Private unselected')] }] });
  expect(() => extractDocumentRange(before, 1, 11)).toThrow();
  expect(before.child(0).child(1).textContent).toBe('Private unselected');
});

it.each([[3, 3], [4, 2], [-1, 2], [0, 99]])('rejects invalid clipboard endpoints %s..%s', (from, to) => {
  const before = schema.nodeFromJSON({ type: 'doc', content: [p('Left'), image] });
  expect(() => extractDocumentRange(before, from, to)).toThrow(RangeError);
});
