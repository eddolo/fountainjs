import suggestionContexts from '../integrations/gitlab/fixtures/suggestion-context-live.json';
import { expect, it } from 'vitest';
import { assertGitLabNativeHostConfiguration as validate } from '../integrations/gitlab/services/host_configuration';

it('accepts the actual MarkdownEditor inactive suggestion defaults and empty serializer hooks', () => {
  expect(() =>
    validate({
      collaborationProvider: null,
      serializerConfig: { marks: {}, nodes: {} },
      codeSuggestionsConfig: { lines: [], lineType: '', canSuggest: false, showPopover: false },
    }),
  ).not.toThrow();
  expect(() => validate({})).not.toThrow();
});

it('accepts inactive NoteForm reply/edit context without enabling code suggestions', () => {
  expect(() =>
    validate({
      codeSuggestionsConfig: {
        canSuggest: false,
        showPopover: false,
        lines: [],
        lineType: '',
        blobRawPath: null,
        lineRange: null,
      },
    }),
  ).not.toThrow();
});

it.each([
  { canSuggest: true },
  { showPopover: true },
  { lines: [42] },
  { lineType: 'new' },
  { futureOption: false },
  { blobRawPath: '/repository/raw/example.ts' },
  { lineRange: { start: 1, end: 1 } },
])('refuses active or unknown suggestion settings %j', (codeSuggestionsConfig) => {
  expect(() => validate({ codeSuggestionsConfig })).toThrow(
    'GITLAB_NATIVE_SUGGESTIONS_ADAPTER_REQUIRED',
  );
});

it('refuses active serializer hooks and legacy collaboration instead of ignoring them', () => {
  expect(() => validate({ serializerConfig: { nodes: { custom: () => '' } } })).toThrow(
    'GITLAB_NATIVE_SERIALIZER_ADAPTER_REQUIRED',
  );
  expect(() => validate({ serializerConfig: { nodes: null } })).toThrow(
    'GITLAB_NATIVE_SERIALIZER_ADAPTER_REQUIRED',
  );
  expect(() => validate({ collaborationProvider: {} })).toThrow(
    'GITLAB_NATIVE_COLLABORATION_ADAPTER_REQUIRED',
  );
});

it('ties native Markdown writers to declared node types and rejects unknown rule fields', () => {
  const native = {extensions:[{name:'workflow',nodes:{label:{group:'inline',inline:true,atom:true}}}]};
  const rule = {toMarkdown:() => '~workflow'};
  expect(() => validate({serializerConfig:{nodes:{label:rule},marks:{}}},native)).not.toThrow();
  for (const nodes of [{missing:rule}, {label:{...rule,extra:true}}, {label:() => '~workflow'}]) {
    expect(() => validate({serializerConfig:{nodes}},native)).toThrow('GITLAB_NATIVE_SERIALIZER_ADAPTER_REQUIRED');
  }
});
it.each(suggestionContexts.fixtures)('keeps real Rapid Diffs $name configuration guarded pending end-to-end acceptance', fixture => {
  expect(() => validate({ codeSuggestionsConfig: fixture.context })).toThrow('GITLAB_NATIVE_SUGGESTIONS_ADAPTER_REQUIRED');
});

it.each(suggestionContexts.fixtures)('accepts actual Rapid Diffs $name only for the explicit native suggestion candidate', fixture => {
  expect(() => validate({ codeSuggestionsConfig: fixture.context }, { codeSuggestions: true })).not.toThrow();
  expect(() => validate({ codeSuggestionsConfig: { ...fixture.context, previewParams: { ...fixture.context.previewParams, head_sha: 'invalid' } } }, { codeSuggestions: true })).toThrow('GITLAB_NATIVE_SUGGESTIONS_ADAPTER_REQUIRED');
});
