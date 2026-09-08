import type { MarkdownImportOptions } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

// The workflow opts into schema-projected HTML tables, not live HTML rendering.
// Keep unrelated raw HTML inert, including trailing siblings of a table block.
export const issueMarkdownOptions: MarkdownImportOptions = {
  parseHTMLBlock(html, schema) {
    if (!/^\s*<table(?:\s|>)/iu.test(html)) return null;
    const doc = ServerHTMLImporter.parse(html, schema);
    return doc.childCount > 0 && doc.content.every(node => node.type.name === 'table') ? doc : null;
  },
};
