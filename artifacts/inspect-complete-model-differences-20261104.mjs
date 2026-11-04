import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import commonmarkSpec from 'commonmark-spec';
import * as engine from '../dist/index.js';
import { createInertHTMLAnchorExtension, createHTMLSourceEmptyBodyExtension, createHTMLSourceEOFExtension,
  createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from '../dist/html-inert.js';
import { createHTMLSourceMarkdownAdapter, exportHTMLSource, importHTMLSourceDocument } from '../dist/html-source.js';
import { ServerHTMLImporter } from '../dist/html-server.js';

const extensions = [engine.HTMLContainerExtension, engine.HTMLCommentExtension, engine.HTMLFlowExtension, engine.HTMLAnchorExtension,
  createInertHTMLAnchorExtension(), createHTMLSourceEmptyBodyExtension(), createHTMLSourceEOFExtension(),
  createInertHTMLInlineExtension({ tags: ['foo', 'bar', 'warning', 'bab', 'c2c', 'b2', 'responsive-image'] }),
  createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] })];
const schema = new engine.Schema({ ...engine.CoreSchemaSpec, nodes: { ...engine.CoreSchemaSpec.nodes,
  ...Object.assign({}, ...extensions.map(extension => extension.nodes)) } });
const differences = (before, after, path = '$', changes = []) => {
  if (JSON.stringify(before) === JSON.stringify(after)) return changes;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) differences(before[key], after[key], `${path}.${key}`, changes);
  } else changes.push({ path, before: before ?? null, after: after ?? null });
  return changes;
};
// Diagnostic only. Keep native JSON/node equality and all acceptance gates exact.
const withoutOldTokens = value => {
  if (Array.isArray(value)) return value.map(withoutOldTokens);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'tokens').map(([key, item]) => [key, withoutOldTokens(item)]));
};
// Explicit diagnostic projection: only join adjacent text leaves with exactly
// equal remaining JSON properties. This does NOT redefine native identity.
const joinAdjacentText = value => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(joinAdjacentText);
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, joinAdjacentText(item)]));
  if (Array.isArray(result.content)) {
    const content = [];
    for (const child of result.content) {
      const previous = content.at(-1);
      const props = node => Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'text'));
      if (previous?.type === 'text' && child.type === 'text' && JSON.stringify(props(previous)) === JSON.stringify(props(child))) {
        previous.text += child.text;
      } else content.push({ ...child });
    }
    result.content = content;
  }
  return result;
};
const inspectionEqual = (left, right) => JSON.stringify(joinAdjacentText(left)) === JSON.stringify(joinAdjacentText(right));
const control = { type: 'paragraph', content: [{ type: 'text', text: 'One' }, { type: 'text', text: ' two' }] };
assert.equal(inspectionEqual(control, { type: 'paragraph', content: [{ type: 'text', text: 'One two' }] }), true);
for (const corrupted of [
  { type: 'paragraph', content: [{ type: 'text', text: 'One TWO' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'One two', marks: [{ type: 'strong' }] }] },
  { type: 'paragraph', attrs: { align: 'right' }, content: [{ type: 'text', text: 'One two' }] },
]) assert.equal(inspectionEqual(control, corrupted), false);
const records = [];
for (const number of [148, 156, 157, 158, 187, 494]) for (const ending of ['\n', '\r\n']) {
  const source = commonmarkSpec.tests.find(item => item.number === number).markdown.replaceAll('→', '\t').replaceAll('\n', ending);
  const doc = engine.MarkdownImporter.parse(source, schema, { parseHTMLDocument: createHTMLSourceMarkdownAdapter({ sourceTokens: true }) });
  const output = exportHTMLSource(doc);
  assert.equal(output.ok, true);
  const hasEOF = doc.content.some(node => node.type.name === 'html_source_eof');
  const safe = new ServerHTMLImporter().parse(engine.HTMLExporter.export(doc), schema);
  const reopened = doc.attrs.htmlSourceEnvelope === undefined && !hasEOF
    ? new ServerHTMLImporter().parse(output.sourceHTML, schema) : importHTMLSourceDocument(output.sourceHTML, schema).document;
  records.push({ number, ending, source, original: doc.toJSON(), safeReopened: safe.toJSON(), sourceReopened: reopened.toJSON(),
    safeDifferences: differences(doc.toJSON(), safe.toJSON()),
    sourceDifferencesExcludingOldTokens: differences(withoutOldTokens(doc.toJSON()), withoutOldTokens(reopened.toJSON())),
    safeEqualOnlyAfterJoiningAdjacentText: inspectionEqual(doc.toJSON(), safe.toJSON()),
    sourceEqualOnlyAfterJoiningAdjacentTextAndExcludingOldTokens: inspectionEqual(withoutOldTokens(doc.toJSON()), withoutOldTokens(reopened.toJSON())),
    sourceHTML: output.sourceHTML, sourceModelStatus: output.modelRoundTrip });
}
assert.deepEqual(records.filter(record => !record.safeEqualOnlyAfterJoiningAdjacentText).map(record => record.number), []);
assert.deepEqual([...new Set(records.filter(record => !record.sourceEqualOnlyAfterJoiningAdjacentTextAndExcludingOldTokens).map(record => record.number))], [156, 157, 158]);
await writeFile('artifacts/commonmark-model-difference-details-20261104.json', JSON.stringify({
  scope: 'Six exact-native-model diagnostics; no conformance, retention or public API changes',
  diagnosticControls: { validTextCoalescing: 1, textMarkAndAttributeCorruptionsRejected: 3 },
  findings: [
    { examples: [148, 187, 494], category: 'Adjacent text leaves combine; characters, marks and attributes agree under the explicitly weaker diagnostic projection.',
      exactNativeModelRetention: false, nextAction: 'Decide whether native text-leaf boundaries need a separate carrier; do not report this as lost visible content or relax node/JSON equality.' },
    { examples: [156, 157, 158], category: 'Source export generates the default HTML5 declaration; the EOF-aware document importer records it as root htmlSourceEnvelope metadata.',
      exactNativeModelRetention: false, nextAction: 'Review an explicit origin/provenance contract before changing generated or authored declaration handling; preserve exact authored spelling and quirks mode.' },
  ], records,
}, null, 2) + '\n');
console.log(JSON.stringify(records.map(({ number, ending, safeEqualOnlyAfterJoiningAdjacentText, sourceEqualOnlyAfterJoiningAdjacentTextAndExcludingOldTokens }) => ({
  number, ending, safeEqualOnlyAfterJoiningAdjacentText, sourceEqualOnlyAfterJoiningAdjacentTextAndExcludingOldTokens,
})), null, 2));
