import { isTableAppearance, TABLE_BORDER_SIDES, TABLE_EDGE_SIDES, type TableAppearance, type TableBorder, type TableBorderSide, type TableEdgeSide } from '../core/table-appearance';
import type { XMLElement } from './xml-types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
type Warn = (code: string, message: string) => void;
function expanded(name: string, element: XMLElement, attribute = false): string {
  const colon = name.indexOf(':');
  return `${colon < 0 ? (attribute ? '' : element.namespaces[''] ?? '') : element.namespaces[name.slice(0, colon)] ?? ''}|${name.slice(colon + 1)}`;
}
function signature(element: XMLElement): string {
  const tree = (item: XMLElement): unknown[] => [expanded(item.name, item),
    Object.entries(item.attrs).map(([name, value]) => [expanded(name, item, true), value]).sort(([a], [b]) => a!.localeCompare(b!)),
    item.children.filter(child => typeof child !== 'string' || child.trim()).map(child => typeof child === 'string' ? child : tree(child)),
  ];
  return JSON.stringify(tree(element));
}
function appearanceChild(element: XMLElement | undefined, local: string, warn: Warn): XMLElement | undefined {
  const matches = element?.children.filter((item): item is XMLElement => typeof item !== 'string' && expanded(item.name, item) === `${W}|${local}`) ?? [];
  if (matches.length < 2) return matches[0];
  const identical = matches.every(item => signature(item) === signature(matches[0]!));
  warn(identical ? 'duplicate-table-appearance-declaration' : 'ambiguous-table-appearance-declaration',
    identical ? `Identical repeated Word ${local} declarations were coalesced; export writes one declaration.`
      : `Conflicting Word ${local} declarations have no unambiguous appearance; that property was omitted without discarding cell content.`);
  return identical ? matches[0] : undefined;
}
function attribute(element: XMLElement, local: string): string | undefined {
  const entries = Object.entries(element.attrs).filter(([name]) => {
    const colon = name.indexOf(':');
    return colon > 0 && name.slice(colon + 1) === local && element.namespaces[name.slice(0, colon)] === W;
  });
  if (entries.length > 1) throw new Error(`Ambiguous Word table appearance attribute ${local}.`);
  return entries[0]?.[1];
}
const BORDER_STYLES = { single: 'solid', double: 'double', dotted: 'dotted', dashed: 'dashed' } as const;

export function readWordTableAppearance(properties: XMLElement | undefined, cell: boolean, warn: Warn): TableAppearance {
  const bordersRoot = appearanceChild(properties, cell ? 'tcBorders' : 'tblBorders', warn);
  const marginsRoot = appearanceChild(properties, cell ? 'tcMar' : 'tblCellMar', warn);
  const borders: Partial<Record<TableBorderSide, TableBorder>> = {};
  const padding: Partial<Record<TableEdgeSide, number>> = {};
  for (const side of cell ? TABLE_EDGE_SIDES : TABLE_BORDER_SIDES) {
    const border = appearanceChild(bordersRoot, side, warn);
    if (!border) continue;
    const type = attribute(border, 'val');
    if (type === 'nil' || type === 'none') { borders[side] = { style: type === 'nil' ? 'hidden' : 'none' }; continue; }
    const style = BORDER_STYLES[type as keyof typeof BORDER_STYLES];
    const rawWidth = attribute(border, 'sz');
    const size = Number(rawWidth);
    if (!style || !rawWidth || !/^\d+$/.test(rawWidth) || size < 1 || size > 96) {
      warn('unsupported-table-border', `Word ${side} border style or width is outside the supported direct-border profile.`); continue;
    }
    const color = attribute(border, 'color');
    if (!color || !/^[\da-f]{6}$/i.test(color)) {
      warn('table-border-color-unresolved', `Word ${side} border has no supported explicit RGB color; the border is omitted.`); continue;
    }
    for (const property of ['themeColor', 'themeTint', 'themeShade', 'shadow', 'frame']) if (attribute(border, property) !== undefined) {
      warn('unsupported-table-border-effect', `Word ${side} border ${property} is not retained; supported explicit RGB line data remains.`);
    }
    const space = attribute(border, 'space');
    if (space !== undefined && space !== '0') warn('unsupported-table-border-space', `Word ${side} border spacing is not represented by a cell border.`);
    borders[side] = { style, width: size / 8, color: '#' + color.toLowerCase() };
  }
  for (const side of TABLE_EDGE_SIDES) {
    const margin = appearanceChild(marginsRoot, side, warn);
    if (!margin) continue;
    const type = attribute(margin, 'type');
    const raw = attribute(margin, 'w');
    const value = Number(raw);
    if (type === 'nil') { padding[side] = 0; continue; }
    if ((type !== undefined && type !== 'dxa') || !raw || !/^\d+$/.test(raw) || value > 20_000) {
      warn('unsupported-table-cell-margin', `Word ${side} cell margin is not a supported non-negative physical length.`); continue;
    }
    padding[side] = value / 20;
  }
  // Logical edges and diagonal/conditional borders are not silently relabelled
  // as physical edges: writing direction and conditional style resolution matter.
  for (const root of [bordersRoot, marginsRoot]) if (root) for (const item of root.children) {
    if (typeof item === 'string') continue;
    const colon = item.name.indexOf(':');
    const local = item.name.slice(colon + 1);
    if (item.namespaces[colon < 0 ? '' : item.name.slice(0, colon)] === W
      && !(root === bordersRoot ? (cell ? TABLE_EDGE_SIDES : TABLE_BORDER_SIDES) : TABLE_EDGE_SIDES).includes(local as TableEdgeSide)) {
      warn('unsupported-table-appearance-edge', `Word ${local} table appearance is not represented by the physical-edge profile.`);
    }
  }
  return { unit: 'pt', ...(Object.keys(borders).length ? { borders } : {}), ...(Object.keys(padding).length ? { padding } : {}) };
}

/** Export only declared appearance. Undefined means a fresh/legacy Fountain
 * table may use its existing application defaults; {unit:'pt'} means none were
 * declared and must not acquire those defaults. */
export function wordTableAppearanceXML(value: unknown, cell: boolean, warn: Warn): string {
  if (!isTableAppearance(value, cell)) return '';
  const borders = (cell ? TABLE_EDGE_SIDES : TABLE_BORDER_SIDES).map(side => {
    const border = value.borders?.[side];
    if (!border) return '';
    if (border.style === 'none' || border.style === 'hidden') return `<w:${side} w:val="${border.style === 'hidden' ? 'nil' : 'none'}"/>`;
    const size = Math.round(border.width * 8);
    if (size / 8 !== border.width) warn('table-border-width-rounded', `The ${side} border width was rounded to Word eighth-point resolution.`);
    return `<w:${side} w:val="${border.style === 'solid' ? 'single' : border.style}" w:sz="${size}" w:color="${border.color.slice(1).toUpperCase()}"/>`;
  }).join('');
  const margins = TABLE_EDGE_SIDES.map(side => {
    const padding = value.padding?.[side];
    if (padding === undefined) return '';
    const twips = Math.round(padding * 20);
    if (twips / 20 !== padding) warn('table-cell-margin-rounded', `The ${side} cell margin was rounded to Word twentieth-point resolution.`);
    return `<w:${side} w:w="${twips}" w:type="dxa"/>`;
  }).join('');
  return `${borders ? `<w:${cell ? 'tcBorders' : 'tblBorders'}>${borders}</w:${cell ? 'tcBorders' : 'tblBorders'}>` : ''}${margins ? `<w:${cell ? 'tcMar' : 'tblCellMar'}>${margins}</w:${cell ? 'tcMar' : 'tblCellMar'}>` : ''}`;
}
