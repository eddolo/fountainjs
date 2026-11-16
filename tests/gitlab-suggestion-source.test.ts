import { expect, it } from 'vitest';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { readGitLabSuggestionSource, serializeGitLabSuggestionSource } from '../integrations/gitlab/services/code_suggestion_source';
import data from '../integrations/gitlab/fixtures/suggestion-live-html.json';

type Element = DefaultTreeAdapterMap['element'];
const pres = (html: string): Element[] => {
  const values: Element[] = [];
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node && node.tagName === 'pre') values.push(node);
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  visit(parseFragment(html)); return values;
};
const fixture = (name: string) => data.fixtures.find(item => item.name === name)!;
it.each(data.fixtures.filter(item => !['invalid-offset', 'offset-spaces'].includes(item.name)))('matches actual $name source and preview without deleting code characters', value => {
  const suggestions = pres(value.body).map(pre => readGitLabSuggestionSource(pre, value.source));
  expect(suggestions).toHaveLength(value.name === 'two' ? 2 : 1);
  for (const suggestion of suggestions) {
    const serialized = serializeGitLabSuggestionSource(suggestion);
    expect(serialized).toContain('suggestion' + (suggestion.params ? ':' + suggestion.params : ''));
    expect(serialized).toContain(suggestion.text);
    expect(suggestion.text === '' || suggestion.text.endsWith('\n')).toBe(true);
  }
  if (value.name === 'one-blank-line') expect(suggestions[0].text).toBe('\n');
  if (value.name === 'two-blank-lines') expect(suggestions[0].text).toBe('\n\n');
  if (value.name === 'trailing-spaces') expect(suggestions[0].text).toBe('keep();  \n');
  if (value.name === 'empty') expect(suggestions[0].text).toBe('');
  if (value.name === 'blank-lines') expect(suggestions[0].text).toBe('\n  keepIndent();\n\n');
  if (value.name === 'literal-unicode') expect(suggestions[0].text).toBe('const key = "A\u200bB";\n');
  if (!['quoted', 'nested-list', 'two'].includes(value.name)) expect(serializeGitLabSuggestionSource(suggestions[0])).toBe(value.source.replace(/\r\n?/gu, '\n'));
});
it.each(['invalid-offset', 'offset-spaces'])('refuses renderer-normalized unsupported metadata: %s', name => {
  const value = fixture(name);
  expect(() => readGitLabSuggestionSource(pres(value.body)[0], value.source)).toThrow('GITLAB_SUGGESTION_SOURCE_AMBIGUOUS');
});
it.each([
  ['text mismatch', (body: string) => body.replace('return true;', 'return false;')],
  ['missing source position', (body: string) => body.replace('data-sourcepos="1:1-3:3"', '')],
  ['wrong source position', (body: string) => body.replace('data-sourcepos="1:1-3:3"', 'data-sourcepos="1:1-99:3"')],
  ['unowned renderer child', (body: string) => body.replace('return true;', '<button>return true;</button>')],
  ['unexpected parameter', (body: string) => body.replace('data-canonical-lang="suggestion"', 'data-canonical-lang="suggestion" data-lang-params="-1+0"')],
] as const)('refuses ambiguous preview: %s', (_name, change) => {
  const value = fixture('single');
  expect(() => readGitLabSuggestionSource(pres(change(value.body))[0], value.source)).toThrow();
});
it('keeps an empty replacement distinct from a literal blank replacement', () => {
  expect(serializeGitLabSuggestionSource({ text: '', params: '-0+0', fence: '```' })).toBe('```suggestion:-0+0\n```');
  expect(serializeGitLabSuggestionSource({ text: '\n', params: '-0+0', fence: '```' })).toBe('```suggestion:-0+0\n\n```');
});
it('increases the closing fence only when replacement source requires it', () => {
  expect(serializeGitLabSuggestionSource({ text: '```\n', params: '-0+0', fence: '```' })).toBe('````suggestion:-0+0\n```\n````');
});

it('handles many fence-like runs without spreading unbounded arguments', () => {
  const text = '` '.repeat(150_000) + '\n';
  const result = serializeGitLabSuggestionSource({ text, params: '', fence: '```' });
  expect(result.startsWith('```suggestion\n')).toBe(true);
  expect(result).toContain(text);
});
