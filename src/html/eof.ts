import { parse, parseFragment, type DefaultTreeAdapterMap } from 'parse5';

/** Locate a discarded EOF tag with parser-checked candidate boundaries.
 * Text locations can extend across discarded EOF tags; quoted values contain '<'.
 * Only complete structural token locations provide a lower bound.
 */
export function unfinishedHTMLTail(source: string): { readonly prefix: string; readonly tail: string } | undefined {
  if (source.length > 1_048_576) return undefined;
  let eof = false, end = 0;
  type ParsedNode = DefaultTreeAdapterMap['node'];
  const visit = (node: ParsedNode): void => {
    const location = node.sourceCodeLocation;
    if (location) {
      if ('tagName' in node && 'startTag' in location) {
        end = Math.max(end, location.startTag?.endOffset ?? 0, location.endTag?.endOffset ?? 0);
      } else if (node.nodeName === '#comment' || node.nodeName === '#documentType') end = Math.max(end, location.endOffset);
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
    if ('content' in node && node.tagName === 'template') visit(node.content);
  };
  const options = { scriptingEnabled: false, sourceCodeLocationInfo: true,
    onParseError: (error: { code: string }) => { if (error.code === 'eof-in-tag') eof = true; } };
  // Document locations retain doctypes/shell tokens, fragment locations retain
  // whitespace that the document parser can omit before its implied shell.
  visit(parse(source, options)); visit(parseFragment(source, options));
  if (!eof) return undefined;
  let attempts = 0;
  for (const match of source.slice(end).matchAll(/<\/?[a-z]/giu)) {
    if (++attempts > 16) return undefined;
    const start = end + match.index;
    const tail = source.slice(start);
    if (tail.length > 65_536) continue;
    let unfinished = false, prefixUnfinished = false;
    const token = parseFragment(tail, { scriptingEnabled: false,
      onParseError: error => { if (error.code === 'eof-in-tag') unfinished = true; } });
    if (!unfinished || token.childNodes.length) continue;
    const prefix = source.slice(0, start);
    parseFragment(prefix, { scriptingEnabled: false,
      onParseError: error => { if (error.code === 'eof-in-tag') prefixUnfinished = true; } });
    if (!prefixUnfinished) return { prefix, tail };
  }
  return undefined;
}
