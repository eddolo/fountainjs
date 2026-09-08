import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Invoked by the existing conformance gate. This is a pending-capability safety
// matrix, not a second parser, runtime dependency, or semantic match baseline.
export function checkMarkdownFlowBoundaries({
  schema, MarkdownImporter, MarkdownExporter, ServerHTMLImporter,
  referenceParser, referenceRenderer, semanticProjection,
}) {
  const fixture = JSON.parse(readFileSync(new URL(
    '../tests/fixtures/markdown/html-flow-pre-boundaries-v1.json', import.meta.url,
  ), 'utf8'));
  assert.equal(fixture.standard, 'CommonMark 0.31.2');
  assert.equal(fixture.status, 'pending-source-aware-flow');
  assert.ok(fixture.cases.length > 0, 'pending matrix must not become empty');
  assert.equal(new Set(fixture.cases.map(test => test.id)).size, fixture.cases.length);
  const routes = [
    { name: 'flow', options: {} },
    { name: 'flow+inline', options: { parseHTMLInline: ServerHTMLImporter.parseInline } },
    { name: 'flow+paragraph', options: {
      parseHTMLInline: ServerHTMLImporter.parseInline,
      parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
    } },
  ];
  let checks = 0;
  for (const test of fixture.cases) {
    assert.ok(test.missingBoundary, `${test.id}: document the missing information`);
    for (const ending of ['\n', '\r\n']) {
      const source = test.source.replaceAll('\n', ending);
      assert.equal(referenceRenderer.render(referenceParser.parse(source)), test.referenceHTML,
        `${test.id}: review reference HTML without whitespace normalization`);
      const inert = MarkdownImporter.parse(source, schema);
      for (const route of routes) {
        const label = `${test.id}/${route.name}/${JSON.stringify(ending)}`;
        const fallbacks = [];
        const imported = MarkdownImporter.parseWithSource(source, schema, {
          ...route.options,
          parseHTMLFlow: ServerHTMLImporter.parseFlow,
          onHTMLFlowFallback: issue => fallbacks.push(issue),
        });
        assert.ok(fallbacks.length, `${label}: unsupported recovery must be reported`);
        assert.ok(fallbacks.every(issue => issue.reason === 'error'), `${label}: explicit refusal`);
        assert.deepEqual(imported.document.toJSON(), inert.toJSON(),
          `${label}: speculative inline/paragraph conversion must roll back`);
        assert.equal(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown,
          source, `${label}: exact source must remain available`);
        schema.validate(imported.document);
        checks++;
      }
    }
  }
  // Demonstrate why recovering from protected node text alone cannot work.
  // These distinct inputs collapse to identical existing flow segments while
  // the reference emits different whitespace inside pre. Neither output may
  // be guessed from that common representation.
  const multiline = fixture.cases.find(test => test.id === 'soft-break').source;
  const singleline = multiline.replace('line one\nline two', 'line one line two');
  const capture = source => {
    const calls = [];
    MarkdownImporter.parse(source, schema, {
      parseHTMLFlow(segments) {
        calls.push(segments.map(segment => segment.kind === 'html' ? segment
          : { kind: 'node', node: segment.node.toJSON() }));
        return null;
      },
    });
    assert.equal(calls.length, 1);
    return calls;
  };
  assert.deepEqual(capture(multiline), capture(singleline), 'review when flow gains source provenance');
  assert.notEqual(referenceRenderer.render(referenceParser.parse(multiline)),
    referenceRenderer.render(referenceParser.parse(singleline)));
  assert.notDeepEqual(semanticProjection(referenceRenderer.render(referenceParser.parse(multiline))),
    semanticProjection(referenceRenderer.render(referenceParser.parse(singleline))),
    'the collision affects preformatted semantics, not merely HTML spelling');
  console.log(`Whole-container pre recovery: ${checks} safe-fallback/source checks; ${fixture.cases.length} unresolved fixtures, not conformance gains. Proven flow-provenance collision.`);
}
