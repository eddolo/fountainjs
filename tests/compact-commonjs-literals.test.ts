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
    const absent = null;
    return [this.longRepeatedMemberName, this?.longRepeatedMemberName, absent?.longRepeatedMemberName];
  }
}
exports.longRepeatedMemberName = new Reader().exercise();`;
  const compacted = compactCommonJsLiterals(original);
  expect(compacted.code).toContain('this[__fountainLiteral');
  expect(compacted.code).toContain('get longRepeatedMemberName()');
  expect(compacted.code).toContain('this?.[__fountainLiteral');
  expect(compacted.code).toContain('absent?.[__fountainLiteral');
  expect(compacted.code).toContain('exports.longRepeatedMemberName');
  const exports: Record<string, unknown> = {};
  runInNewContext(compacted.code, { exports });
  expect(exports.longRepeatedMemberName).toEqual([3, 3, undefined]);
});

it('shares ordinary object members while retaining receivers, definitions and static exports', () => {
  const original = `"use strict";
const dependency = require("fixture");
const record = {
  __proto__: { inherited: true },
  get longRepeatedProperty() { return this.counter; },
  set longRepeatedProperty(value) { this.counter = value; },
  longRepeatedMethod() { return this.longRepeatedProperty; },
};
record.longRepeatedProperty = 2;
record.longRepeatedProperty++;
const result = [record.longRepeatedMethod(), record.longRepeatedMethod(),
  dependency.longRepeatedMethod(), require("fixture").longRepeatedMethod()];
const remove = delete record.longRepeatedMethod;
exports.longRepeatedMethod = record.longRepeatedMethod;
module.exports.longRepeatedProperty = record.longRepeatedProperty;
Object.defineProperty(exports, "getter", { enumerable: true, get: () => record.longRepeatedProperty });
exports.result = [result, remove, record.inherited, Object.keys(record), Object.keys(exports)];`;
  const compacted = compactCommonJsLiterals(original);
  expect(compacted.code).toContain('record[__fountainLiteral');
  expect(compacted.code).toContain('get [__fountainLiteral');
  expect(compacted.code).toContain('set [__fountainLiteral');
  expect(compacted.code).toContain('__proto__: { inherited: true }');
  expect(compacted.code).toContain('dependency.longRepeatedMethod()');
  expect(compacted.code).toContain('require("fixture").longRepeatedMethod()');
  expect(compacted.code).toContain('exports.longRepeatedMethod');
  expect(compacted.code).toContain('module.exports.longRepeatedProperty');
  expect(compacted.code).toContain('enumerable: true');
  const exports: Record<string, unknown> = {};
  runInNewContext(compacted.code, { exports, module: { exports }, require: () => ({ longRepeatedMethod() { return 4; } }) });
  expect(exports.getter).toBe(3);
  expect(exports.result).toEqual([[3, 3, 4, 4], true, true, ['longRepeatedProperty', 'counter'],
    ['longRepeatedMethod', 'longRepeatedProperty', 'getter']]);
});

it('shares public class fields with their reads and writes while retaining private fields and names', () => {
  const original = `class Fixture {
  longRepeatedField = function () {};
  static longRepeatedStaticField = 3;
  #longRepeatedField = 4;
  inspect() {
    const initialName = this.longRepeatedField.name;
    this.longRepeatedField = this.#longRepeatedField;
    return [initialName, this.longRepeatedField, Fixture.longRepeatedStaticField];
  }
}
const fixture = new Fixture();
exports.result = [fixture.inspect(), Object.keys(fixture), Object.getOwnPropertyDescriptor(Fixture, "longRepeatedStaticField").value];
exports.inspect = Fixture.prototype.inspect;`;
  const compacted = compactCommonJsLiterals(original);
  expect(compacted.code).toMatch(/class Fixture\s*{\s*\[__fountainLiteral\$\d+\] = function/);
  expect(compacted.code).toContain('static [__fountainLiteral');
  expect(compacted.code).toContain('#longRepeatedField = 4');
  expect(compacted.code).toContain('inspect()');
  const exports: Record<string, unknown> = {};
  runInNewContext(compacted.code, { exports });
  expect(exports.result).toEqual([['longRepeatedField', 4, 3], ['longRepeatedField'], 3]);
});

it('shares repeated case labels and concise arrow returns without changing switch matching', () => {
  const original = `const originalValue = () => "long-repeated-command-value";
function run(value) {
  switch (value) {
    case "long-repeated-command-value": return "long-repeated-command-value";
    case "other-command": return "other";
    default: return "fallback";
  }
}
exports.result = [run(originalValue()), run(new String(originalValue())), run("other-command")];`;
  const compacted = compactCommonJsLiterals(original);
  expect(compacted.code).toMatch(/=>\s+__fountainLiteral\$\d+/);
  expect(compacted.code).toMatch(/case\s+__fountainLiteral\$\d+/);
  const exports: Record<string, unknown> = {};
  runInNewContext(compacted.code, { exports });
  expect(exports.result).toEqual(['long-repeated-command-value', 'fallback', 'other']);
});

it('keeps private split-chunk exports live and preserves public declarations for Node', () => {
  const original = `"use strict";
Object.defineProperty(exports, 'first', { enumerable: true, get: function () { return binding; } });
observe();
let binding = 1;
Object.defineProperty(exports, 'second', { enumerable: true, get: function () { return binding; } });
Object.defineProperty(exports, 'third', { enumerable: true, get: function () { return binding; } });
Object.defineProperty(exports, 'other', { configurable: true, get() { return this; } });
exports.update = () => ++binding;`;
  const transformed = compactCommonJsLiterals(original, true);
  expect(transformed.code).toContain('function __fountainLiveExport');
  expect(compactCommonJsLiterals(original)?.code ?? original).toContain("Object.defineProperty(exports, 'first'");
  for (const code of [original, transformed.code]) {
    const exports: Record<string, unknown> = {};
    runInNewContext(code, { exports, observe: () => {
      expect(Object.keys(exports)).toEqual(['first']);
      expect(() => exports.first).toThrow(/before initialization/);
    } });
    expect(exports.first).toBe(1);
    (exports.update as () => number)();
    expect([exports.first, exports.second, exports.third]).toEqual([2, 2, 2]);
    expect(exports.other).toBe(exports);
    const descriptor = Object.getOwnPropertyDescriptor(exports, 'first')!;
    expect(descriptor).toMatchObject({ enumerable: true, configurable: false, set: undefined });
    expect(descriptor.get?.name).toBe('get');
    expect(Object.hasOwn(descriptor.get!, 'prototype')).toBe(true);
  }
});
