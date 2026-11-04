import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as api from '../dist/index.js';
const count = 5000;
const source = '# Keep [link][r0] ###\n\n' + Array.from({ length: count }, (_, index) => `> [r${index}]: /target/${index}`).join('\n') + '\n>\n'
  + Array.from({ length: count }, (_, index) => `> Paragraph ${index} with __source__ [reference][r${index}].`).join('\n>\n') + '\n';
const schema = new api.Schema(api.CoreSchemaSpec);
const captured = api.MarkdownImporter.parseWithSource(source, schema);
const quote = captured.document.child(1);
const changed = captured.document.copy([captured.document.child(0), quote.copy(quote.content.map((node, index) => index === 2500
  ? schema.node('paragraph', {}, [schema.text('Changed.')]) : node))]);
for (let index = 0; index < 4; index++) {
  const start = performance.now();
  const result = api.MarkdownExporter.exportWithSource(changed, captured.source);
  assert.equal(result.markdown, source.replace('Paragraph 2500 with __source__ [reference][r2500].', 'Changed.'));
  console.log(JSON.stringify({ index, exportMs: performance.now() - start }));
}
