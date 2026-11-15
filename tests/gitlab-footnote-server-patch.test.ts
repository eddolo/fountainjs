import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareGitLabFootnoteFilter } from '../integrations/gitlab/services/footnote_filter_patch.mjs';

const source = readFileSync(new URL('../integrations/gitlab/fixtures/footnote-filter-upstream.rb', import.meta.url), 'utf8');
it('uses the exact original filter distributed by the pinned image', () => {
  expect(createHash('sha256').update(source).digest('hex')).toBe('3c3e2469ca0ce9191954f725548fa0bf3599ca9ccc8980b3fbdca46e14e1dc74');
  expect(prepareGitLabFootnoteFilter(source)).not.toBe(source);
});
it.each([
  (value: string) => value.replace('FOOTNOTE_LIMIT = 1000', 'FOOTNOTE_LIMIT = 500'),
  (value: string) => value.replace('link_node[:href] += rand_suffix', 'link_node[:href] = "#changed"'),
  (value: string) => value + '\n# An unreviewed upstream change.\n',
])('refuses to replace an unreviewed server implementation', change => {
  const changed = change(source);
  expect(changed).not.toBe(source);
  expect(() => prepareGitLabFootnoteFilter(changed)).toThrow('Inspect the pinned GitLab footnote filter');
});
