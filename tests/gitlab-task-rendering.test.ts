import { expect, it } from 'vitest';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { Schema } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { normalizeGitLabTasks } from '../integrations/gitlab/services/task_rendering';
import data from '../integrations/gitlab/fixtures/task-live-html.json';

type Element = DefaultTreeAdapterMap['element'];
function normalize(body: string, source: string) {
  const fragment = parseFragment(body), elements: Element[] = [];
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) elements.push(node);
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  visit(fragment);
  const result = normalizeGitLabTasks(elements, source);
  return { ...result, html: serialize(fragment) };
}
const fixtures = data.fixtures.filter(item => item.name.startsWith('inapplicable'));
const expected: Record<string, string[]> = {
  inapplicable: ['Not needed', 'Pending', 'Done'],
  'inapplicable-marked': ['Bold and authored strike and code'],
  'inapplicable-nested': ['ParentChildPlain child'],
  'inapplicable-loose': ['FirstFollow-up paragraph.', 'Next'],
  'inapplicable-empty': [''],
  'inapplicable-spaces': ['  Keep two spaces'],
  'inapplicable-nbsp': ['\u00a0Keep NBSP'],
  'inapplicable-newline': ['Parent\nChild'],
};
it.each(fixtures)('prepares $name without importing generated strike or whitespace as authored content', fixture => {
  const result = normalize(fixture.body, fixture.source);
  expect(result.issues).toEqual([]);
  expect(result.html).toContain('data-fountain-gitlab-task-state="inapplicable"');
  expect(result.html).not.toContain('<s class="inapplicable">');
  const parsed = new ServerHTMLImporter().parse(result.html, new Schema(createGitLabSchemaSpec()));
  expect(parsed.child(0).content.map(item => item.textContent)).toEqual(expected[fixture.name]);
  const strikes: string[] = [];
  parsed.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'strike')) strikes.push(node.textContent); });
  expect(strikes).toEqual(fixture.name === 'inapplicable-marked' ? ['authored strike'] : []);
});
it.each([
  ['source mismatch', (html: string) => html, '- [ ] Not needed'],
  ['missing source position', (html: string) => html.replace('data-checkbox-sourcepos="1:4-1:4"', ''), undefined],
  ['checked state collision', (html: string) => html.replace('data-inapplicable=""', 'data-inapplicable="" checked'), undefined],
  ['missing input state', (html: string) => html.replace('data-inapplicable=""', ''), undefined],
  ['missing item state', (html: string) => html.replace('inapplicable task-list-item', 'task-list-item'), undefined],
  ['modified generated strike', (html: string) => html.replace('<s class="inapplicable">', '<s class="inapplicable" title="authored">'), undefined],
  ['unowned generated strike', (html: string) => html + '<s class="inapplicable">Outside</s>', undefined],
  ['missing generated separator', (html: string) => html.replace('> <s', '><s'), undefined],
] as const)('refuses ambiguous third-state metadata: %s', (_name, change, source) => {
  const fixture = fixtures[0];
  expect(normalize(change(fixture.body), source ?? fixture.source).issues).not.toEqual([]);
});
