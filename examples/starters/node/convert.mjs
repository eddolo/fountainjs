import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { CoreSchemaSpec } from 'fountainjs-editor';
import {
  HTMLExporter, MarkdownExporter, MarkdownImporter, Schema,
} from 'fountainjs-editor/core';

const [filename, format = 'json', ...extra] = process.argv.slice(2);
const extension = filename ? extname(filename).toLowerCase() : '.md';
if (extra.length || !['json', 'html', 'markdown'].includes(format)
  || !['.md', '.markdown', '.html', '.htm'].includes(extension)) {
  console.error('Usage: node convert.mjs [file.md|file.html] [json|html|markdown]');
  process.exitCode = 1;
} else {
  const schema = new Schema(CoreSchemaSpec);
  const source = await readFile(filename ?? new URL('./sample.md', import.meta.url));
  const hasUTF8Marker = source[0] === 0xef && source[1] === 0xbb && source[2] === 0xbf;
  const input = new TextDecoder('utf-8', { fatal: true }).decode(source);
  let imported;
  if (extension === '.html' || extension === '.htm') {
    const { ServerHTMLImporter } = await import('fountainjs-editor/html/server');
    imported = ServerHTMLImporter.parseWithReport(input, schema);
    for (const issue of imported.issues) console.error(`${issue.code}: ${issue.message}`);
  } else {
    imported = MarkdownImporter.parseWithSource(input, schema);
  }

  // Validate the portable data using the same schema a consumer would use.
  const document = schema.nodeFromJSON(imported.document.toJSON());
  if (format === 'json') {
    process.stdout.write(JSON.stringify(document.toJSON(), null, 2) + '\n');
  } else if (format === 'html') {
    process.stdout.write(HTMLExporter.export(document, { document: false }) + '\n');
  } else {
    const exported = imported.source
      ? MarkdownExporter.exportWithSource(document, imported.source)
      : MarkdownExporter.exportWithReport(document);
    for (const loss of exported.losses) console.error(`${loss.kind}: ${loss.detail}`);
    const marker = imported.source && hasUTF8Marker ? '\uFEFF' : '';
    process.stdout.write(marker + exported.markdown);
  }
}
