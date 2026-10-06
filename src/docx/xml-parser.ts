import type { XMLElement } from './xml-types';

export interface DOCXXMLLimits {
  readonly maxXmlNodes: number;
  readonly maxXmlDepth: number;
}

function decodeXML(value: string): string {
  return value.replace(/&(?:#(x[\da-f]+|\d+)|amp|lt|gt|quot|apos);/gi, (entity, numeric: string | undefined) => {
    if (numeric) {
      const codePoint = Number.parseInt(numeric[0]?.toLowerCase() === 'x' ? numeric.slice(1) : numeric, numeric[0]?.toLowerCase() === 'x' ? 16 : 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : '\ufffd';
    }
    return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" } as Record<string, string>)[entity.toLowerCase()] ?? entity;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = Object.create(null);
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) {
    if (Object.hasOwn(attrs, match[1]!)) throw new Error('Duplicate DOCX XML attribute.');
    attrs[match[1]!] = decodeXML(match[2] ?? match[3] ?? '');
  }
  return attrs;
}

/** The existing DOCX parser, shared with style decoding without a second parser
 * or a fake DOM. Package byte limits are enforced by the caller before parsing.
 */
export function parseDOCXXML(source: string, limits: DOCXXMLLimits): XMLElement {
  const root: XMLElement = { name: '#document', attrs: {}, children: [], namespaces: { xml: 'http://www.w3.org/XML/1998/namespace' } };
  const stack: XMLElement[] = [root];
  let nodes = 1;
  const tokens = source.match(/<!--[\s\S]*?-->|<\?[^>]*\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?') || (token.startsWith('<!') && !token.startsWith('<![CDATA['))) continue;
    if (token.startsWith('<![CDATA[')) {
      stack.at(-1)!.children.push(token.slice(9, -3));
      continue;
    }
    if (!token.startsWith('<')) {
      if (token) stack.at(-1)!.children.push(decodeXML(token));
      continue;
    }
    if (token.startsWith('</')) {
      const closing = token.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.name !== closing || stack.length === 0) throw new Error(`Malformed DOCX XML near </${closing}>.`);
      continue;
    }
    const selfClosing = /\/\s*>$/.test(token);
    const body = token.slice(1, selfClosing ? token.lastIndexOf('/') : -1).trim();
    const split = body.search(/\s/);
    const name = split < 0 ? body : body.slice(0, split);
    if (!name) throw new Error('Malformed DOCX XML start tag.');
    nodes += 1;
    if (nodes > limits.maxXmlNodes) throw new Error(`DOCX XML exceeds ${limits.maxXmlNodes} nodes.`);
    if (!selfClosing && stack.length >= limits.maxXmlDepth) throw new Error(`DOCX XML exceeds depth ${limits.maxXmlDepth}.`);
    const attrs = parseAttributes(split < 0 ? '' : body.slice(split + 1));
    let namespaces = stack.at(-1)!.namespaces;
    const declarations = Object.entries(attrs).filter(([key]) => key === 'xmlns' || key.startsWith('xmlns:'));
    if (declarations.length) namespaces = { ...namespaces, ...Object.fromEntries(declarations.map(([key, value]) => [key === 'xmlns' ? '' : key.slice(6), value])) };
    const element: XMLElement = { name, attrs, children: [], namespaces };
    stack.at(-1)!.children.push(element);
    if (!selfClosing) stack.push(element);
  }
  if (stack.length !== 1) throw new Error('DOCX XML contains unclosed elements.');
  return root;
}
