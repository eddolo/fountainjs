import { expect, it } from 'vitest';
import live from '../integrations/gitlab/fixtures/autocomplete-live.json';
import { parseGitLabAutocompleteItems, gitLabAutocompleteSources, type GitLabAutocompleteKind } from '../integrations/gitlab/services/autocomplete_data';

it('normalizes actual authenticated records without a DOM, fabricated IDs or links', () => {
  expect(typeof globalThis.document).toBe('undefined');
  expect(parseGitLabAutocompleteItems('user', live.results.members.data)).toEqual([
    { id: 'user:@root', kind: 'user', source: '@root', label: '@root', description: 'Administrator' },
  ]);
  expect(parseGitLabAutocompleteItems('issue', live.results.issues.data)[0]).toMatchObject({
    id: 'issue:#75', source: '#75', description: 'Fountain reference controls fixture: & <review>',
  });
  expect(parseGitLabAutocompleteItems('merge_request', live.results.mergeRequests.data)[0].source).toBe('!1');
  expect(parseGitLabAutocompleteItems('label', live.results.labels.data).map(item => item.source))
    .toEqual(['~"Fountain quick action & review"', '~"Fountain reference & review"']);
  expect(parseGitLabAutocompleteItems('milestone', live.results.milestones.data)[0].source).toBe('%"Fountain native completion milestone"');
});
it('does not turn a failed or missing endpoint into an empty successful response', () => {
  expect(live.results.contacts.status).toBe(404);
  expect(() => parseGitLabAutocompleteItems('user', live.results.contacts.data)).toThrow('RESPONSE_INVALID');
  expect(parseGitLabAutocompleteItems('snippet', live.results.snippets.data)).toEqual([]);
});
it.each(['issue_alternative', 'work_item'] as const)('retains the host reference for %s and falls back to a local issue number', kind => {
  expect(parseGitLabAutocompleteItems(kind, [{ iid: 4, reference: 'other/project#4', title: 'Other project' }])[0].source).toBe('other/project#4');
  expect(parseGitLabAutocompleteItems(kind, [{ iid: 5, title: 'Local' }])[0].source).toBe('#5');
});
it.each([
  ['snippet', { id: 12, title: 'Snippet' }, '$12'],
  ['vulnerability', { id: 42, title: 'Finding' }, '[vulnerability:42]'],
  ['iteration', { id: 8, reference: '*iteration:8', title: 'Sprint' }, '*iteration:8'],
  ['epic', { iid: 7, reference: 'team&7', title: 'Programme' }, 'team&7'],
  ['epic_alternative', { iid: 7, reference: 'team&7', title: 'Programme' }, 'team&7'],
  ['status', { name: 'In progress' }, '"In progress"'],
  ['type', { name: 'Task' }, '"Task"'],
  ['wiki', { title: 'My guide', slug: 'my-guide', path: '/wiki/my-guide' }, '[[My guide|my-guide]]'],
] as const)('uses the inspected host source contract for %s', (kind, record, source) => {
  expect(parseGitLabAutocompleteItems(kind, [record])[0].source).toBe(source);
});
it('uses stable source identity across reordering and deduplicates identical records', () => {
  const first = { username: 'alice', name: 'Alice' }, second = { username: 'bob', name: 'Bob' };
  const items = parseGitLabAutocompleteItems('user', [first, second, first]);
  expect(items.map(item => item.id)).toEqual(['user:@alice', 'user:@bob']);
  expect(parseGitLabAutocompleteItems('user', [second, first])[1].id).toBe(items[0].id);
  expect(Object.isFrozen(items)).toBe(true); expect(Object.isFrozen(items[0])).toBe(true);
});
it.each([null, {}, [null], [{ username: '@x', name: 'Bad' }], [{ username: 'x\ny', name: 'Bad' }],
  [{ username: 'x', name: 'One' }, { username: 'x', name: 'Two' }]])('refuses malformed or ambiguous envelopes %#', value => {
  expect(() => parseGitLabAutocompleteItems('user', value)).toThrow('RESPONSE_INVALID');
});
it.each([0, -1, NaN, Infinity, 1.5, '1e2', '01', '9007199254740992'])('refuses invalid reference IDs %s', id => {
  expect(() => parseGitLabAutocompleteItems('snippet', [{ id, title: 'Source' }])).toThrow('RESPONSE_INVALID');
});
it('validates milestone iid instead of accepting its null global id', () => {
  expect(() => parseGitLabAutocompleteItems('milestone', [{ id: 1, iid: null, title: 'Bad' }])).toThrow('RESPONSE_INVALID');
});
it('escapes literal label source without interpreting it as Markdown', () => {
  expect(parseGitLabAutocompleteItems('label', [{ title: 'a"\\b' }])[0].source).toBe('~' + JSON.stringify('a"\\b'));
  expect(parseGitLabAutocompleteItems('label', [{ title: 'simple' }])[0].source).toBe('~simple');
});
it('rejects unknown kinds, oversized responses and multi-line source', () => {
  expect(() => parseGitLabAutocompleteItems('unknown' as GitLabAutocompleteKind, [])).toThrow();
  expect(() => parseGitLabAutocompleteItems('user', Array(10001))).toThrow();
  expect(() => parseGitLabAutocompleteItems('label', [{ title: 'one\ntwo' }])).toThrow();
  expect(gitLabAutocompleteSources.status).toBeNull();
});
