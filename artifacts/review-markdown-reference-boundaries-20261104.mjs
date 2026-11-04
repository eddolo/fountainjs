import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import * as before from './markdown-nested-source-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';

const records = [];
for (const ending of ['\n', '\r\n', '\r']) {
  const source = ['[ref]: /target "Original"', '', '# Keep [link][ref] ###', '', '~~~~js', 'first', ''].join(ending);
  for (const action of ['move', 'append', 'delete-heading', 'insert-before-fence']) {
    const record = { ending, action, source };
    for (const [label, api] of [['before', before], ['after', after]]) {
      const schema = new api.Schema(api.CoreSchemaSpec);
      const imported = api.MarkdownImporter.parseWithSource(source, schema);
      const [heading, code] = imported.document.content;
      const paragraph = schema.node('paragraph', {}, [schema.text('Keep appended text.')]);
      const changed = imported.document.copy(action === 'move' ? [code, heading] : action === 'append' ? [heading, code, paragraph]
        : action === 'delete-heading' ? [code] : [heading, paragraph, code]);
      const result = api.MarkdownExporter.exportWithSource(changed, imported.source);
      const reopened = api.MarkdownImporter.parse(result.markdown, schema);
      const fullModelEqual = JSON.stringify(changed.toJSON()) === JSON.stringify(reopened.toJSON());
      record[label] = { fullModelEqual, preservation: result.preservation, markdown: result.markdown,
        expected: changed.toJSON(), reopened: reopened.toJSON() };
      assert.equal(fullModelEqual, label === 'after', `${action}/${JSON.stringify(ending)}/${label}`);
    }
    records.push(record);
  }
}
await writeFile('artifacts/markdown-reference-boundaries-counterfactual-20261104.json', JSON.stringify({
  baseline: 'actual PR #10 tarball consumer, source commit 86a4633c6fcca01f8e7a7a2055c3e280e3057277',
  cases: records.length, baselineFailures: records.filter(item => !item.before.fullModelEqual).length,
  repaired: records.filter(item => item.after.fullModelEqual).length, records,
}, null, 2) + '\n');
console.log('12 actual-parent cases lose document data; all 12 current cases reopen with full model equality.');
