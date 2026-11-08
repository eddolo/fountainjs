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

it('shares class receiver property names without renaming keys or changing the receiver', () => {
  const original = `class Reader {
  get longRepeatedMemberName() { return this.localValue; }
  set longRepeatedMemberName(value) { this.localValue = value; }
  exercise() {
    this.longRepeatedMemberName = 1;
    this.longRepeatedMemberName += 2;
    return [this.longRepeatedMemberName, this?.longRepeatedMemberName];
  }
}
exports.longRepeatedMemberName = new Reader().exercise();`;
  const compacted = compactCommonJsLiterals(original);
  expect(compacted.code).toContain('this[__fountainLiteral');
  expect(compacted.code).toContain('get longRepeatedMemberName()');
  expect(compacted.code).toContain('this?.longRepeatedMemberName');
  expect(compacted.code).toContain('exports.longRepeatedMemberName');
  const exports: Record<string, unknown> = {};
  runInNewContext(compacted.code, { exports });
  expect(exports.longRepeatedMemberName).toEqual([3, 3]);
});
