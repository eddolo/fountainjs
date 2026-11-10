import type { Attributes } from './node-spec';

/** Internal attribute processing shared by factories and checked projections. */
export function computeAttrs(
  specs: Record<string, { default?: unknown; validate?: (value: unknown) => boolean }> = {},
  supplied: Attributes = {},
): Attributes {
  // Attribute names are data, including "__proto__" and "constructor".
  // Use an inert scratch object; freezeAttributes supplies the public clone.
  const result: Attributes = Object.create(null);
  for (const [name, spec] of Object.entries(specs)) {
    const value = Object.hasOwn(supplied, name) ? supplied[name] : spec.default;
    if (value === undefined && !('default' in spec)) throw new Error(`Missing required attribute: ${name}`);
    if (spec.validate && !spec.validate(value)) throw new Error(`Invalid value for attribute: ${name}`);
    // An explicitly undefined default declares an optional attribute. Absence
    // must stay absence: persisting undefined breaks portable JSON/Yjs values.
    if (value !== undefined) result[name] = value;
  }
  for (const [name, value] of Object.entries(supplied)) {
    if (!Object.hasOwn(specs, name)) result[name] = value;
  }
  return result;
}

export function isDeeplyImmutable(value: unknown, ancestors?: ReadonlySet<object>): boolean {
  if (value === null) return true;
  if (typeof value !== 'object') {
    const kind = typeof value;
    return kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'undefined';
  }
  if (ancestors?.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  if (!Object.isFrozen(value)) return false;
  // Most attribute bags contain only scalars. Track the active path only
  // when descending into a child object, where a cycle can occur.
  let nextAncestors: Set<object> | undefined;
  for (const entry of Object.values(value)) {
    if (entry !== null && typeof entry === 'object') nextAncestors ??= new Set(ancestors).add(value);
    if (!isDeeplyImmutable(entry, nextAncestors)) return false;
  }
  return true;
}
