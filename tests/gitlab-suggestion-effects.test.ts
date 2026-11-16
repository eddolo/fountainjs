import { expect, it } from 'vitest';
import { Schema, HTMLExporter } from 'fountainjs-editor';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { gitLabSuggestionDeletesLines } from '../integrations/gitlab/services/code_suggestion_source';
import { serializeGitLabSuggestionNode } from '../integrations/gitlab/services/code_suggestion_node';
import oracle from '../integrations/gitlab/fixtures/suggestion-whitespace-live.json';

it('matches every Unicode scalar against the actual pinned Ruby POSIX whitespace oracle', () => {
  expect(typeof document).toBe('undefined');
  const actual = [];
  for (let code = 0; code <= 0x10ffff; code++) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    if (gitLabSuggestionDeletesLines(String.fromCodePoint(code))) actual.push(code);
  }
  expect(actual).toEqual(oracle.codepoints);
  expect(gitLabSuggestionDeletesLines('')).toBe(true);
  expect(gitLabSuggestionDeletesLines(oracle.codepoints.map(code => String.fromCodePoint(code)).join(''))).toBe(true);
});
it.each(['\u200b', '\u200d', '\ufeff', 'x', '\n x\n', '\\n', '\uE000'])('does not mislabel real source %j as a deletion', text => {
  expect(gitLabSuggestionDeletesLines(text)).toBe(false);
});
it.each(['', '\n', '\n\n', ' \t\n', '\u0085\u00a0\u3000'])('labels host deletion effect while retaining source %j exactly', text => {
  const schema = new Schema(createGitLabSchemaSpec());
  const node = schema.node('gitlab_code_suggestion', {params:'-0+0',fence:'```'}, [schema.text(text)]);
  const html = HTMLExporter.export(schema.node('doc',{},[node]), { document:false });
  expect(html).toContain('Deletes target lines'); expect(html).toContain('data-fountain-suggestion-effect="deletion"');
  expect(node.textContent).toBe(text);
  expect(serializeGitLabSuggestionNode(node)).toBe('```suggestion:-0+0\n'+text+(text && !text.endsWith('\n')?'\n':'')+'```');
});
