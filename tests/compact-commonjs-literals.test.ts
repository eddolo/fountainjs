// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
// @ts-expect-error The internal build script has no declaration file.
import { compactCommonJsLiterals } from '../scripts/compact-commonjs-literals.mjs';

it('shares literal values while preserving directives, property names and module references', () => {
  const value = 'a long repeated string with Unicode 😀\uD800';
  const literal = JSON.stringify(value);
  const original = `"use strict";
const dependency = require(${literal});
Object.defineProperty(exports, ${literal}, { value: dependency });
exports.value = (function () { return this === undefined && ${literal}; })();
exports.record = { ${literal}: ${literal} };
exports.repeat = [${literal}, ${literal}];
`;
  const compacted = compactCommonJsLiterals(original);
  expect(compacted.code).toMatch(/^"use strict";\s*const __fountainLiteral/);
  expect(compacted.code).toContain(`require(${literal})`);
  expect(compacted.code).toContain(`Object.defineProperty(exports, ${literal},`);
  expect(compacted.code).toContain(`{ ${literal}:`);
  const exports: Record<string, unknown> = {};
  runInNewContext(compacted.code, { exports, require: (requested: string) => requested });
  expect(exports[value]).toBe(value);
  expect(exports.value).toBe(value);
  expect(exports.record).toEqual({ [value]: value });
  expect(exports.repeat).toEqual([value, value]);
});
