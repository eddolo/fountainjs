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

it.each([
  { canSuggest: true },
  { showPopover: true },
  { lines: [42] },
  { lineType: 'new' },
  { futureOption: false },
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
