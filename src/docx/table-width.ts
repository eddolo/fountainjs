import { isTablePreferredWidth, type TablePreferredWidth } from '../core/table-width';
import { wordStyleChild } from './style-projection';
import type { XMLElement } from './xml-types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
type Warn = (code: string, message: string) => void;
function attribute(element: XMLElement, local: string): string | undefined {
  const matches = Object.entries(element.attrs).filter(([name]) => {
    const colon = name.indexOf(':');
    return colon > 0 && name.slice(colon + 1) === local && element.namespaces[name.slice(0, colon)] === W;
  });
  if (matches.length > 1) throw new Error(`Ambiguous Word table width attribute ${local}.`);
  return matches[0]?.[1];
}

export function readWordTableWidth(properties: XMLElement | undefined, warn: Warn): TablePreferredWidth | undefined {
  const element = wordStyleChild(properties, 'tblW');
  // OOXML omission means automatic, not Fountain's undeclared host-width
  // default. Materialize the effective preference at the format boundary.
  if (!element) return { unit: 'auto' };
  const type = attribute(element, 'type');
  const raw = attribute(element, 'w');
  if (type === 'auto' || type === 'nil') {
    if (raw !== undefined && raw !== '0') warn('table-width-ignored-value', `Word ${type} ignores its width value; export uses zero with the retained type.`);
    return { unit: type };
  }
  const decimalPercent = type === 'pct' && raw !== undefined && /^\d+(?:\.\d+)?%$/.test(raw);
  const validNumber = raw !== undefined && raw.length <= 32 && (/^\d+$/.test(raw) || decimalPercent);
  const candidate = { unit: type === 'pct' ? 'percent' : 'pt',
    value: decimalPercent ? Number(raw!.slice(0, -1)) : Number(raw) / (type === 'pct' ? 50 : 20) };
  if (!['dxa', 'pct'].includes(type ?? '') || !validNumber || !isTablePreferredWidth(candidate)) {
    warn('unsupported-table-preferred-width', 'Word preferred table width is not a supported bounded physical/percentage declaration; the cell grid and content remain.');
    return undefined;
  }
  return candidate;
}

export function wordTableWidthXML(value: unknown, warn: Warn): string | undefined {
  if (!isTablePreferredWidth(value)) return undefined;
  if (value.unit === 'auto' || value.unit === 'nil') return `<w:tblW w:w="0" w:type="${value.unit}"/>`;
  const scale = value.unit === 'pt' ? 20 : 50;
  const amount = Math.round(value.value * scale);
  if (amount / scale !== value.value) warn('table-preferred-width-rounded', 'Preferred table width was rounded to native twentieth-point or fiftieth-percent resolution.');
  return `<w:tblW w:w="${amount}" w:type="${value.unit === 'pt' ? 'dxa' : 'pct'}"/>`;
}
