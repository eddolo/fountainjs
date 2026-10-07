// @vitest-environment node
import { expect, it } from 'vitest';
import { Schema } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const cases = [
  ['ul', '<ul dir="rtl"><li>List text</li></ul>'],
  ['ol', '<ol dir="rtl"><li>Ordered text</li></ol>'],
  ['ul', '<ul dir="rtl" data-type="task-list"><li>Task text</li></ul>'],
  ['blockquote', '<blockquote dir="rtl"><p>Quote text</p></blockquote>'],
  ['table', '<table dir="rtl"><tr><td>First</td><td>Second</td></tr></table>'],
  ['dl', '<dl dir="rtl"><dt>Term</dt><dd>Description</dd></dl>'],
] as const;

it.each(cases)('reports lost %s container direction separately from retained paragraph direction', (tag, source) => {
  expect(typeof globalThis.document).toBe('undefined');
  const result = ServerHTMLImporter.parseWithReport(source, schema);
  expect(result.document.child(0).attrs).not.toHaveProperty('dir');
  const leaves: string[] = [];
  const visit = (node: typeof result.document) => {
    if (node.type.name === 'paragraph') { expect(node.attrs.dir).toBe('rtl'); leaves.push(node.textContent); }
    else node.content.forEach(visit);
  };
  visit(result.document);
  expect(leaves.length).toBeGreaterThan(0);
  expect(result.issues).toContainEqual(expect.objectContaining({
    code: 'block-html-projection',
    message: expect.stringContaining(`${tag} reading direction (rtl) is not retained on the structural container`),
  }));
});

it('reports inherited fixed structural direction even when child text direction survives', () => {
  const result = ServerHTMLImporter.parseWithReport('<section dir="rtl"><ul><li><p>English</p></li></ul></section>', schema);
  expect(result.document.child(0).child(0).child(0).attrs.dir).toBe('rtl');
  expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unmapped-block-wrapper' }));
  expect(result.issues).toContainEqual(expect.objectContaining({ message: expect.stringContaining('ul reading direction (rtl)') }));
});

it('reports an omitted shared automatic direction without guessing it on every child', () => {
  const result = ServerHTMLImporter.parseWithReport('<ul dir="auto"><li><p>עברית</p><p>English</p></li></ul>', schema);
  expect(result.document.child(0).child(0).content.every(node => node.attrs.dir === undefined)).toBe(true);
  expect(result.issues).toContainEqual(expect.objectContaining({ message: expect.stringContaining('ul reading direction (auto)') }));
});

it('does not warn for ordinary directionless structures or supported text-block overrides', () => {
  const result = ServerHTMLImporter.parseWithReport('<ul><li><p dir="rtl">Text</p></li></ul><table><tr><td><p dir="rtl">Cell</p></td></tr></table>', schema);
  expect(result.issues.filter(issue => issue.message.includes('structural container'))).toEqual([]);
});

it('leaves extension-owned direction retention authoritative', () => {
  const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, bullet_list: {
    ...CoreSchemaSpec.nodes.bullet_list,
    attrs: { dir: { default: undefined, validate: (value: unknown) => value === undefined || value === 'rtl' } },
    parseHTML: [{ tag: 'ul[dir="rtl"]', getAttrs: () => ({ dir: 'rtl' }) }],
  }, list_item: { ...CoreSchemaSpec.nodes.list_item, parseHTML: [{ tag: 'li' }] } } });
  const result = ServerHTMLImporter.parseWithReport('<ul dir="rtl"><li>Text</li></ul>', custom);
  expect(result.document.child(0).attrs.dir).toBe('rtl');
  expect(result.issues.filter(issue => issue.message.includes('structural container'))).toEqual([]);
});
