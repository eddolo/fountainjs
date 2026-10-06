import type { XMLElement } from './xml-types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
// Office's order differs from ISO's generic order: columns override row bands,
// then edge rows override edge columns, then the four corners override both.
export const WORD_TABLE_REGIONS = ['band1Horz', 'band2Horz', 'band1Vert', 'band2Vert', 'firstCol', 'lastCol', 'firstRow', 'lastRow', 'nwCell', 'neCell', 'swCell', 'seCell'] as const;
export type WordTableRegion = typeof WORD_TABLE_REGIONS[number];
export interface WordTableTextXML {
  readonly runs: readonly XMLElement[];
  readonly paragraphs: readonly XMLElement[];
}
type Warn = (code: string, message: string) => void;
const children = (element?: XMLElement): XMLElement[] => element?.children.filter((item): item is XMLElement => typeof item !== 'string') ?? [];
function expanded(element: XMLElement, name = element.name, attribute = false): string {
  const colon = name.indexOf(':');
  return `${colon < 0 ? (attribute ? '' : element.namespaces[''] ?? '') : element.namespaces[name.slice(0, colon)] ?? ''}|${name.slice(colon + 1)}`;
}
function one(element: XMLElement | undefined, local: string): XMLElement | undefined {
  const matches = children(element).filter(item => expanded(item) === `${W}|${local}`);
  if (matches.length > 1) throw new Error(`Ambiguous Word table style ${local}.`);
  return matches[0];
}
function value(element: XMLElement | undefined, local: string): string | undefined {
  if (!element) return undefined;
  const matches = Object.entries(element.attrs).filter(([name]) => expanded(element, name, true) === `${W}|${local}`);
  if (matches.length > 1) throw new Error(`Ambiguous Word table style attribute ${local}.`);
  return matches[0]?.[1];
}

/** A later border/margin group overrides only its declared physical edges.
 * Duplicate declarations within one source layer stay duplicate so the existing
 * appearance decoder reports/coalesces them rather than arbitrarily choosing.
 * No source tree is mutated, and foreign namespace lookalikes never win.
 */
export function mergeWordTableProperties(local: 'tblPr' | 'tcPr', layers: readonly (XMLElement | undefined)[]): XMLElement | undefined {
  const groups = new Map<string, XMLElement[]>();
  let any = false;
  for (const layer of layers) {
    if (!layer) continue;
    any = true;
    const current = new Map<string, XMLElement[]>();
    for (const property of children(layer)) {
      const key = expanded(property);
      if (!key.startsWith(`${W}|`)) continue;
      current.set(key, [...(current.get(key) ?? []), property]);
    }
    for (const [key, declarations] of current) {
      const previous = groups.get(key);
      if (previous?.length === 1 && declarations.length === 1
        && ['tblBorders', 'tblCellMar', 'tcBorders', 'tcMar'].some(name => key === `${W}|${name}`)) {
        const edges = new Map<string, XMLElement[]>();
        for (const group of [previous[0]!, declarations[0]!]) {
          const ownEdges = new Map<string, XMLElement[]>();
          for (const edge of children(group)) {
            const name = expanded(edge);
            if (!name.startsWith(`${W}|`)) continue;
            ownEdges.set(name, [...(ownEdges.get(name) ?? []), edge]);
          }
          for (const [name, values] of ownEdges) edges.set(name, values);
        }
        groups.set(key, [{ ...declarations[0]!, children: [...edges.values()].flat() }]);
      } else groups.set(key, declarations);
    }
  }
  return any ? { name: `w:${local}`, attrs: {}, namespaces: { w: W }, children: [...groups.values()].flat() } : undefined;
}

/** Internal bounded inheritance index. Conditional appearance stays a format
 * boundary; portable documents contain effective declarations, not Word rules.
 * Text is decoded separately into the existing run/paragraph cascade. Row-height
 * rules still have explicit loss diagnostics.
 */
export function createWordTableStyleCascade(elements: readonly XMLElement[], maxDepth = 64) {
  const index = new Map<string, XMLElement>();
  let defaultId: string | undefined;
  for (const element of elements) {
    const id = value(element, 'styleId')!; // Global identity/duplicate checks belong to style-reader.
    index.set(id, element);
    if (value(element, 'type') !== 'table') continue;
    const flag = value(element, 'default');
    if (flag !== undefined && !['1', 'true', 'on', '0', 'false', 'off'].includes(flag)) throw new Error('Invalid Word default table style flag.');
    if (flag && ['1', 'true', 'on'].includes(flag)) {
      if (defaultId !== undefined) throw new Error('Ambiguous Word default table styles.');
      defaultId = id;
    }
    const parent = id === 'TableNormal' ? undefined : one(element, 'basedOn');
    if (parent && (!value(parent, 'val') || value(parent, 'val')!.length > 253)) throw new Error('Invalid Word table parent style identity.');
  }
  const cache = new Map<string, { chain: readonly XMLElement[]; problems: readonly [string, string][] }>();
  return (requested: string | undefined, warn: Warn) => {
    const id = requested ?? defaultId;
    if (id === undefined) return { ids: [] as readonly string[], table: undefined, cell: undefined, regions: new Map<WordTableRegion, XMLElement>(), text: { runs: [], paragraphs: [] } as WordTableTextXML, regionalText: new Map<WordTableRegion, WordTableTextXML>() };
    let resolved = cache.get(id);
    if (!resolved) {
      const chain: XMLElement[] = []; const problems: [string, string][] = []; const seen = new Set<string>();
      let next: string | undefined = id;
      while (next !== undefined) {
        if (seen.has(next)) { problems.push(['table-style-cycle', `Word table style inheritance cycles at ${next}; no cyclic appearance was guessed.`]); chain.length = 0; break; }
        if (chain.length >= maxDepth) { problems.push(['table-style-depth-limit', 'Word table style inheritance exceeds the bounded depth; direct appearance remains.']); chain.length = 0; break; }
        const element = index.get(next);
        if (!element) { problems.push(['table-style-missing', `Word table style ${next} is missing; inherited appearance is incomplete.`]); break; }
        if (value(element, 'type') !== 'table') { problems.push(['table-style-kind-mismatch', `Word table style ${next} references a non-table style; inherited appearance is incomplete.`]); break; }
        seen.add(next); chain.push(element); next = next === 'TableNormal' ? undefined : value(one(element, 'basedOn'), 'val');
      }
      resolved = { chain: Object.freeze(chain.reverse()), problems: Object.freeze(problems) };
      // Missing user-supplied references must not expand this document's cache.
      if (index.has(id)) cache.set(id, resolved);
    }
    for (const [code, message] of resolved.problems) warn(code, message);
    const tableLayers: XMLElement[] = []; const cellLayers: XMLElement[] = [];
    const regionalLayers = new Map<WordTableRegion, XMLElement[]>();
    const text: { runs: XMLElement[]; paragraphs: XMLElement[] } = { runs: [], paragraphs: [] };
    const regionalText = new Map<WordTableRegion, { runs: XMLElement[]; paragraphs: XMLElement[] }>();
    const supported = { tblPr: new Set(['tblBorders', 'tblCellMar', 'shd', 'tblW', 'tblLayout', 'tblCellSpacing', 'tblLook', 'tblStyleRowBandSize', 'tblStyleColBandSize']), tcPr: new Set(['tcBorders', 'tcMar', 'shd']) };
    for (const element of resolved.chain) {
      const styleId = value(element, 'styleId')!;
      // Word ignores all child declarations of the reserved TableNormal style,
      // including basedOn. It is not a source of inherited cell/text defaults.
      if (styleId === 'TableNormal') continue;
      const seenRegions = new Set<string>();
      for (const property of children(element)) {
        const name = expanded(property);
        if (!name.startsWith(`${W}|`)) continue;
        const local = name.slice(W.length + 1);
        if (local === 'tblPr' || local === 'tcPr') {
          one(element, local); // Fail closed on ambiguous property roots.
          const accepted: XMLElement[] = [];
          for (const item of children(property)) {
            const itemName = expanded(item);
            if (!itemName.startsWith(`${W}|`)) continue;
            if (supported[local].has(itemName.slice(W.length + 1))) accepted.push(item);
            else warn('table-style-property-not-imported', `Word table style ${styleId}: ${local}/${itemName.slice(W.length + 1)} is not represented by the inherited appearance profile.`);
          }
          (local === 'tblPr' ? tableLayers : cellLayers).push({ ...property, children: accepted });
        } else if (local === 'tblStylePr') {
          const type = value(property, 'type');
          if (!type || !(WORD_TABLE_REGIONS as readonly string[]).includes(type)) {
            warn('table-style-conditional-not-imported', `Word table style ${styleId}: conditional ${type ?? '(missing type)'} is not supported. Word ignores wholeTable overrides; no appearance was invented.`);
            continue;
          }
          if (seenRegions.has(type)) throw new Error(`Ambiguous Word table style region ${type}.`);
          seenRegions.add(type);
          const textLayers = regionalText.get(type as WordTableRegion) ?? { runs: [], paragraphs: [] };
          const run = one(property, 'rPr'); const paragraph = one(property, 'pPr');
          if (run) textLayers.runs.push(run);
          if (paragraph) textLayers.paragraphs.push(paragraph);
          if (run || paragraph) regionalText.set(type as WordTableRegion, textLayers);
          const cell = one(property, 'tcPr');
          if (cell) {
            const accepted: XMLElement[] = [];
            for (const item of children(cell)) {
              const name = expanded(item);
              if (!name.startsWith(`${W}|`)) continue;
              if (supported.tcPr.has(name.slice(W.length + 1))) accepted.push(item);
              else warn('table-style-conditional-property-not-imported', `Word table style ${styleId}/${type}: tcPr/${name.slice(W.length + 1)} is not represented by the conditional appearance profile.`);
            }
            const layers = regionalLayers.get(type as WordTableRegion) ?? [];
            layers.push({ ...cell, children: accepted });
            regionalLayers.set(type as WordTableRegion, layers);
          }
          for (const item of children(property)) {
            const name = expanded(item);
            if (name.startsWith(`${W}|`) && !['tcPr', 'pPr', 'rPr'].some(local => name === `${W}|${local}`) && children(item).length) {
              warn('table-style-conditional-property-not-imported',
                `Word table style ${styleId}/${type}: ${name.slice(W.length + 1)} is not applied by the conditional cell appearance profile.`);
            }
          }
        } else if (local === 'pPr' || local === 'rPr') {
          one(element, local);
          (local === 'pPr' ? text.paragraphs : text.runs).push(property);
        } else if (local === 'trPr' && children(property).length) {
          warn('table-style-property-not-imported', `Word table style ${styleId}: row properties are not represented by whole-table appearance.`);
        }
      }
    }
    return { ids: Object.freeze(resolved.chain.map(element => value(element, 'styleId')!)),
      table: mergeWordTableProperties('tblPr', tableLayers), cell: mergeWordTableProperties('tcPr', cellLayers),
      regions: new Map([...regionalLayers].map(([region, layers]) => [region, mergeWordTableProperties('tcPr', layers)!])),
      text, regionalText };
  };
}

/** Resolve geometric regions, not cached cnfStyle annotations (those describe
 * previously computed formatting and can be stale after third-party edits).
 * Office omits row bands at size zero; its absent tblLook default is 04A0.
 * Explicit names override corresponding mask bits, including false resets.
 */
export function createWordTableRegions(properties: XMLElement | undefined, warn: Warn) {
  const look = one(properties, 'tblLook');
  const raw = value(look, 'val');
  let mask = look ? 0 : 0x04a0;
  if (raw !== undefined) {
    if (!/^[\da-f]{1,4}$/i.test(raw)) warn('invalid-table-style-look', 'Invalid Word table-look mask was not guessed; explicit flags still apply.');
    else mask = Number.parseInt(raw, 16);
  }
  const flag = (name: string, bit: number) => {
    const raw = value(look, name);
    if (raw === undefined) return Boolean(mask & bit);
    if (['1', 'true', 'on'].includes(raw)) return true;
    if (['0', 'false', 'off'].includes(raw)) return false;
    warn('invalid-table-style-look', `Invalid Word table-look ${name} was not guessed; its mask bit remains.`);
    return Boolean(mask & bit);
  };
  const firstRow = flag('firstRow', 0x20); const lastRow = flag('lastRow', 0x40);
  const firstCol = flag('firstColumn', 0x80); const lastCol = flag('lastColumn', 0x100);
  const noHBand = flag('noHBand', 0x200); const noVBand = flag('noVBand', 0x400);
  const bandSize = (name: string, fallback: number) => {
    const element = one(properties, name);
    if (!element) return fallback;
    const raw = value(element, 'val');
    if (raw !== undefined && /^[0-3]$/.test(raw)) return Number(raw);
    warn('invalid-table-style-band-size', `Word ${name} is not a supported 0–3 band size; that banding was disabled rather than guessed.`);
    return 0;
  };
  const rowBand = bandSize('tblStyleRowBandSize', 0); const colBand = bandSize('tblStyleColBandSize', 1);
  return (row: number, count: number, column: number, span: number, width: number): readonly WordTableRegion[] => {
    const first = row === 0 && firstRow; const last = row === count - 1 && lastRow;
    const left = column === 0 && firstCol; const right = column + span === width && lastCol;
    const names = new Set<WordTableRegion>();
    if (!noHBand && rowBand && !first && !last) names.add(Math.floor((row - Number(firstRow)) / rowBand) % 2 === 0 ? 'band1Horz' : 'band2Horz');
    if (!noVBand && colBand && !left && !right) names.add(Math.floor((column - Number(firstCol)) / colBand) % 2 === 0 ? 'band1Vert' : 'band2Vert');
    if (left) names.add('firstCol'); if (right) names.add('lastCol');
    if (first) names.add('firstRow'); if (last) names.add('lastRow');
    if (first && left) names.add('nwCell'); if (first && right) names.add('neCell');
    if (last && left) names.add('swCell'); if (last && right) names.add('seCell');
    return WORD_TABLE_REGIONS.filter(name => names.has(name));
  };
}
