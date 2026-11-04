import { isParagraphLayout, type ParagraphLayout } from '../core/paragraph-layout';
import type { Node } from '../core/schema';
import { expandedXMLName } from './xml-names';
import type { XMLElement } from './xml-types';

export const PARAGRAPH_BRIDGE_PART = 'customXml/fountainParagraphs.xml';
export const PARAGRAPH_BRIDGE_NS = 'urn:fountainjs:paragraphs:v1';
export const WORD_PARAGRAPH_ID_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const children = (element: XMLElement) => element.children.filter((item): item is XMLElement => typeof item !== 'string');
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));

interface ParagraphRole {
  readonly part: string;
  readonly id: string;
  readonly style: string;
  readonly kind: 'code' | 'caption';
  readonly language?: string;
  readonly lineNumbers?: boolean;
}

/** Native styles own adjacency and native formatting owns appearance. This
 * metadata only names opaque groups and binds roles with no OOXML equivalent.
 * It never restores a document/formatting/source snapshot over native edits.
 */
export function createParagraphBridge() {
  const groups = new Map<string, string>();
  const roles: ParagraphRole[] = [];
  let nextID = 1;
  let metadataBytes = 256; // Envelope, collection keys and delimiters.
  const reserve = (value: unknown) => {
    // Charge escaped UTF-8 before growing the collections or building the
    // final XML string; one large document cannot defer the byte bound.
    let bytes = 1;
    for (const character of JSON.stringify(value)) {
      const point = character.codePointAt(0)!;
      bytes += character === '"' || character === "'" ? 6 : character === '&' ? 5 : character === '<' || character === '>' ? 4
        : point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    }
    if (metadataBytes + bytes > 8_000_000) throw new RangeError('DOCX paragraph metadata exceeds its expanded byte limit.');
    metadataBytes += bytes;
  };
  return {
    groups,
    roles,
    style(layout: ParagraphLayout | undefined): string | undefined {
      if (layout?.spacingGroup === undefined) return;
      let style = groups.get(layout.spacingGroup);
      if (!style) {
        if (groups.size >= 4000) throw new RangeError('DOCX paragraph groups exceed 4000 styles.');
        style = `FountainSpacing${groups.size + 1}`;
        reserve([style, layout.spacingGroup]);
        groups.set(layout.spacingGroup, style);
      }
      return style;
    },
    role(part: string, style: string, node?: Node): string {
      if (roles.length >= 500_000) throw new RangeError('DOCX paragraph roles exceed 500000 records.');
      if (node && (String(node.attrs.language ?? '').length > 1024 || /[\s\u0000-\u001f\u007f]/u.test(String(node.attrs.language ?? '')))) throw new RangeError('DOCX code language cannot be represented in bounded paragraph metadata.');
      const id = (nextID++).toString(16).toUpperCase().padStart(8, '0');
      const role: ParagraphRole = { part, id, style, kind: node ? 'code' : 'caption',
        ...(node ? { language: String(node.attrs.language ?? ''), lineNumbers: node.attrs.lineNumbers === true } : {}) };
      reserve(role); roles.push(role);
      return id;
    },
  };
}

function paragraphID(element: XMLElement): string | undefined {
  const matches = Object.entries(element.attrs).filter(([name]) => !name.startsWith('xmlns') && expandedXMLName(element, name, true) === `${WORD_PARAGRAPH_ID_NS}|paraId`);
  if (matches.length !== 1 || !/^[\da-f]{8}$/i.test(matches[0]![1])) return;
  const id = matches[0]![1].toUpperCase();
  return Number.parseInt(id, 16) > 0 && Number.parseInt(id, 16) < 0x80000000 ? id : undefined;
}

/** Decode bounded inert metadata; the caller validates its internal package
 * relationship and applies the existing archive/XML expansion limits first.
 */
export function readParagraphBridge(document: XMLElement, paragraphStyles: ReadonlySet<string>, maxRecords: number) {
  const roots = children(document);
  const root = roots[0];
  if (roots.length !== 1 || !root || expandedXMLName(root) !== `${PARAGRAPH_BRIDGE_NS}|paragraphs`
    || Object.keys(root.attrs).some(key => key !== 'version' && key !== 'xmlns' && !key.startsWith('xmlns:'))
    || root.attrs.version !== '1' || children(root).length) throw new Error('Invalid Fountain paragraph metadata root.');
  const data: unknown = JSON.parse(root.children.join(''));
  if (!record(data) || !exactKeys(data, ['groups', 'roles']) || !Array.isArray(data.groups) || data.groups.length > 4000
    || !Array.isArray(data.roles) || data.roles.length > maxRecords) throw new Error('Invalid Fountain paragraph metadata shape or limits.');
  const groups = new Map<string, string>();
  const identities = new Set<string>();
  for (const pair of data.groups) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !paragraphStyles.has(pair[0])
      || typeof pair[1] !== 'string' || !isParagraphLayout({ unit: 'pt', spacingGroup: pair[1] })
      || groups.has(pair[0]) || identities.has(pair[1])) throw new Error('Invalid or ambiguous Fountain spacing-group identity.');
    groups.set(pair[0], pair[1]); identities.add(pair[1]);
  }
  const roles = new Map<string, ParagraphRole>();
  for (const role of data.roles) {
    if (!record(role) || !exactKeys(role, ['part', 'id', 'style', 'kind', 'language', 'lineNumbers'])
      || typeof role.part !== 'string' || role.part.length > 1024 || !/^word\/.+\.xml$/.test(role.part)
      || /[\\:\u0000-\u001f?#]/.test(role.part) || role.part.split('/').some(segment => !segment || segment === '.' || segment === '..')
      || typeof role.id !== 'string' || !/^[\dA-F]{8}$/.test(role.id) || Number.parseInt(role.id, 16) <= 0 || Number.parseInt(role.id, 16) >= 0x80000000
      || typeof role.style !== 'string' || !paragraphStyles.has(role.style) || !['code', 'caption'].includes(String(role.kind))
      || role.kind === 'code' && (typeof role.language !== 'string' || role.language.length > 1024 || /[\s\u0000-\u001f\u007f]/u.test(role.language) || typeof role.lineNumbers !== 'boolean')
      || role.kind === 'caption' && ('language' in role || 'lineNumbers' in role)) throw new Error('Invalid Fountain paragraph role.');
    const key = `${role.part}|${role.id}`;
    if (roles.has(key)) throw new Error('Ambiguous Fountain paragraph role.');
    roles.set(key, role as unknown as ParagraphRole);
  }
  const parts = new Map<string, Map<string, XMLElement | null>>();
  return {
    groups: groups as ReadonlyMap<string, string>,
    identities: identities as ReadonlySet<string>,
    register(part: string, root: XMLElement) {
      // The same physical header can be reparsed for default/first/even
      // variants. Index the current XML objects, never stale object identities.
      const index = new Map<string, XMLElement | null>();
      const pending = [root];
      while (pending.length) {
        const element = pending.pop()!;
        if (expandedXMLName(element) === `${W}|p`) {
          const id = paragraphID(element);
          if (id) index.set(id, index.has(id) ? null : element);
        }
        for (const child of children(element)) pending.push(child);
      }
      parts.set(part, index);
    },
    role(element: XMLElement, part: string, style: string | undefined, outlineLevel: number | undefined, warn: () => void): ParagraphRole | undefined {
      const id = paragraphID(element);
      if (!id) return;
      const role = roles.get(`${part}|${id}`);
      if (!role) return;
      if (parts.get(part)?.get(id) !== element || role.style !== style || outlineLevel !== undefined && outlineLevel !== 9) { warn(); return; }
      return role;
    },
  };
}
