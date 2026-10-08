// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const fixture = (name: string) => JSON.parse(read(`./fixtures/markdown/${name}.json`));
const count = (ranges: string): number => ranges.split(',').reduce((sum, range) => {
  const [from, to = from] = range.split('-').map(Number);
  return sum + to - from + 1;
}, 0);

it('keeps the public developer guide aligned with the enforced CommonMark profiles', () => {
  const defaults = fixture('commonmark-semantic-baseline-v1');
  const containers = fixture('commonmark-document-flow-v1');
  const comments = fixture('commonmark-comment-flow-v1');
  const anonymous = fixture('commonmark-anonymous-flow-v1');
  expect(new Set([defaults, containers, comments, anonymous].map(value => value.projectionVersion)).size).toBe(1);
  expect(anonymous.requiredMatchRanges).toBe(comments.requiredMatchRanges);
  const guide = read('../examples/react-app/src/Developers.tsx');
  const declared = guide.match(/(\d+)\/652 default matches, (\d+)\/652 with whole-document containers, and (\d+)\/652 with comments\/anonymous flow/);
  expect(declared).not.toBeNull();
  expect(declared!.slice(1).map(Number)).toEqual([defaults, containers, comments].map(value => count(value.requiredMatchRanges)));
  expect(guide).toContain('This is not full CommonMark conformance or pixel fidelity');
});
