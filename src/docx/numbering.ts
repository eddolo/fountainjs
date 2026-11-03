import type { XMLElement } from './xml-types';
import { expandedXMLName, qualifiedWordAttribute as attribute } from './xml-names';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const children = (parent: XMLElement | undefined, local: string): XMLElement[] =>
  parent?.children.filter((item): item is XMLElement => typeof item !== 'string' && expandedXMLName(item) === `${W}|${local}`) ?? [];
function one(parent: XMLElement | undefined, local: string): XMLElement | undefined {
  const matches = children(parent, local);
  if (matches.length > 1) throw new Error(`Ambiguous Word numbering ${local}.`);
  return matches[0];
}
function identity(element: XMLElement | undefined, name: string): string | undefined {
  if (!element) return undefined;
  const raw = attribute(element, name);
  if (raw === undefined || !/^\d{1,10}$/.test(raw) || Number(raw) > 2147483647) throw new Error(`Invalid Word numbering ${name}.`);
  return String(Number(raw));
}
const value = (parent: XMLElement | undefined, name: string) => {
  const item = one(parent, name);
  return item && attribute(item, 'val');
};
function levelIndex(element: XMLElement): number {
  const index = identity(element, 'ilvl');
  if (index === undefined || Number(index) > 8) throw new Error('Invalid Word numbering level.');
  return Number(index);
}

export interface WordNumberingLevel {
  readonly ordered: boolean;
  readonly start: number;
  /** Abstract-level style association, independent of instance overrides. */
  readonly style?: string;
}

/** Namespace-aware references. Zero is an explicit removal, not absence. */
export function readWordNumberingReference(properties: XMLElement | undefined, includeLevel = true) {
  const reference = one(properties, 'numPr');
  if (!reference) return undefined;
  const id = identity(one(reference, 'numId'), 'val');
  const index = includeLevel ? identity(one(reference, 'ilvl'), 'val') : undefined;
  if (index !== undefined && Number(index) > 8) throw new Error('Invalid Word numbering level.');
  return Object.freeze({ id, level: index === undefined ? undefined : Number(index) });
}

/** Decode bounded, document-owned list instances without a DOM or style-name
 * guesses. Duplicate identities and levels must not silently overwrite data.
 */
export function readWordNumbering(document: XMLElement | undefined): ReadonlyMap<string, WordNumberingLevel> {
  const result = new Map<string, WordNumberingLevel>();
  if (!document) return result;
  const root = one(document, 'numbering');
  if (!root) throw new Error('Invalid Word numbering root.');
  const abstracts = new Map<string, Map<number, WordNumberingLevel>>();
  const readLevel = (element: XMLElement): WordNumberingLevel => {
    const format = value(element, 'numFmt') ?? 'decimal';
    const raw = Number(value(element, 'start') ?? 1);
    return Object.freeze({ ordered: format !== 'bullet' && format !== 'none',
      start: Number.isSafeInteger(raw) && raw >= 0 && raw <= 2147483647 ? raw : 1,
      style: value(element, 'pStyle') });
  };
  for (const element of children(root, 'abstractNum')) {
    const id = identity(element, 'abstractNumId')!;
    if (abstracts.has(id)) throw new Error('Ambiguous Word numbering abstract identity.');
    const levels = new Map<number, WordNumberingLevel>();
    for (const level of children(element, 'lvl')) {
      const index = levelIndex(level);
      if (levels.has(index)) throw new Error('Ambiguous Word numbering level.');
      levels.set(index, readLevel(level));
    }
    abstracts.set(id, levels);
  }
  const instances = new Set<string>();
  for (const instance of children(root, 'num')) {
    const id = identity(instance, 'numId')!;
    if (instances.has(id)) throw new Error('Ambiguous Word numbering instance identity.');
    instances.add(id);
    const abstract = identity(one(instance, 'abstractNumId'), 'val');
    for (const [index, level] of abstracts.get(abstract ?? '') ?? []) result.set(`${id}:${index}`, level);
    const overrides = new Set<number>();
    for (const override of children(instance, 'lvlOverride')) {
      const index = levelIndex(override);
      if (overrides.has(index)) throw new Error('Ambiguous Word numbering level override.');
      overrides.add(index);
      const key = `${id}:${index}`;
      const base = result.get(key);
      const definition = one(override, 'lvl');
      if (definition && levelIndex(definition) !== index) throw new Error('Invalid Word numbering override level.');
      const level = definition ? readLevel(definition) : base;
      if (!level) continue;
      const start = Number(value(override, 'startOverride') ?? level.start);
      result.set(key, Object.freeze({ ...level, style: base?.style,
        start: Number.isSafeInteger(start) && start >= 0 && start <= 2147483647 ? start : level.start }));
    }
  }
  return result;
}
