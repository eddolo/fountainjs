import type { MarkdownImportOptions } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

// Opt into schema-projected tables and definition lists, not live HTML rendering.
// Keep unrelated raw HTML inert, including trailing siblings of an accepted block.
export const issueMarkdownOptions: MarkdownImportOptions = {
  parseHTMLBlock(html, schema) {
    if (!/^\s*<(?:table|dl)(?:\s|>)/iu.test(html)) return null;
    const doc = ServerHTMLImporter.parse(html, schema);
    return doc.childCount > 0 && doc.content.every(node => ['table', 'definition_list'].includes(node.type.name)) ? doc : null;
  },
};
