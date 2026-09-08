import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Invoked by the existing conformance gate. This is a pending-capability safety
// matrix, not a second parser, runtime dependency, or semantic match baseline.
export function checkMarkdownFlowBoundaries({
  schema, MarkdownImporter, MarkdownExporter, HTMLExporter, ServerHTMLImporter,
  referenceParser, referenceRenderer, semanticProjection,
}) {
  const fixture = JSON.parse(readFileSync(new URL(
    '../tests/fixtures/markdown/html-flow-pre-boundaries-v1.json', import.meta.url,
  ), 'utf8'));
  assert.equal(fixture.standard, 'CommonMark 0.31.2');
  assert.equal(fixture.status, 'partial-paragraph-source-flow');
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
      parseHTMLFlow(segments, _schema, context) {
        assert.ok(context, 'importer supplies lazy paragraph-source context');
        const paragraphs = context.readParagraphSources();
        assert.equal(context.readParagraphSources(), paragraphs, 'context is cached');
        calls.push({
          legacy: segments.map(segment => segment.kind === 'html' ? segment
            : { kind: 'node', node: segment.node.toJSON() }),
          paragraphs: paragraphs.map(paragraph => ({ source: paragraph.source,
            segments: paragraph.segments.map(segment => segment.kind === 'html' ? segment : {
              kind: segment.kind, node: segment.node.toJSON(), softBreak: segment.softBreak, textRun: segment.textRun,
            }),
          })),
        });
        return null;
      },
    });
    assert.equal(calls.length, 1);
    return calls[0];
  };
  const multi = capture(multiline);
  const single = capture(singleline);
  assert.deepEqual(multi.legacy, single.legacy, 'existing flow segments remain compatible');
  assert.notDeepEqual(multi.paragraphs, single.paragraphs, 'new paragraph context must resolve the information collision');
  assert.notEqual(referenceRenderer.render(referenceParser.parse(multiline)),
    referenceRenderer.render(referenceParser.parse(singleline)));
  assert.notDeepEqual(semanticProjection(referenceRenderer.render(referenceParser.parse(multiline))),
    semanticProjection(referenceRenderer.render(referenceParser.parse(singleline))),
    'the collision affects preformatted semantics, not merely HTML spelling');
  console.log(`Identity-preserving flow: ${checks} safe-fallback/source checks; ${fixture.cases.length} fixtures still declined on this route. Lazy paragraph context distinguishes the legacy collision.`);
  const supported = new Set(['table-pre', 'soft-break', 'entity-crlf', 'unclosed']);
  let recovered = 0;
  let fullMatches = 0;
  const codeContent = projection => {
    const found = [];
    const visit = value => {
      if (!Array.isArray(value)) return;
      if (value[0] === 'code-block') found.push(value);
      else value.forEach(visit);
    };
    visit(projection);
    return found;
  };
  for (const test of fixture.cases) for (const ending of ['\n', '\r\n']) {
    const source = test.source.replaceAll('\n', ending);
    const fallbacks = [];
    const imported = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow,
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    assert.equal(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown, source);
    if (supported.has(test.id)) {
      assert.equal(fallbacks.length, 0, `${test.id}: paragraph flow must recover`);
      const actual = semanticProjection(HTMLExporter.export(imported.document, { document: false }));
      const expected = semanticProjection(test.referenceHTML);
      assert.deepEqual(codeContent(actual), codeContent(expected), `${test.id}: exact reference preformatted content`);
      if (test.id === 'table-pre') {
        assert.deepEqual(actual, expected, `${test.id}: full recovered reference semantics`);
        fullMatches++;
      } else {
        // Keep the known omitted outer div visible in the strict comparator.
        // Exact code text is useful, but is not full structural conformance.
        assert.notDeepEqual(actual, expected, `${test.id}: review wrapper retention if newly matching`);
      }
      recovered++;
    } else {
      assert.ok(fallbacks.length, `${test.id}: structural projection remains unsupported`);
      assert.deepEqual(imported.document.toJSON(), MarkdownImporter.parse(source, schema).toJSON());
    }
  }
  console.log(`Explicit paragraph-source flow: ${recovered} LF/CRLF exact-code/source contracts; ${fullMatches} full structural matches. Outer-div mismatches retained; 4 structural fixture kinds still declined.`);
  const textBlockCases = [...fixture.cases, ...[
    ['setext', 'First\nsecond\n---'], ['indented-code', '    x'],
    ['empty-code', '```\n```'], ['blank-code', '```\n\n```'],
    ['literal-code', '```\n<b>x</b> &amp; *y*\n```'],
    ['heading-mark', '# **Title**'],
    ['loose-list', '- one\n\n- two'],
    ['ordered-list', '3. one\n4. two'],
    ['empty-list-item', '-\n- two'],
    ['nested-list', '- one\n  - nested\n  - second\n- two'],
    ['list-quote', '- one\n\n  > quoted\n  > line\n\n- two'],
    ['quote-list', '> - one\n> - two'],
    ['nested-code', '- one\n\n  ```js\n  x < y\n  ```\n\n- two'],
    ['list-heading', '- # Title\n- item'],
    ['nested-quote', '> first\n>\n> > second'],
    ['empty-quote', '>'],
    ['backslash-break', 'line\\\nbreak'],
    ['multiple-breaks', 'one  \ntwo\\\nthree'],
    ['list-break', '- one  \n  two\n- three'],
    ['quote-break', '> one\\\n> two'],
    ['heading-break', 'first  \nsecond\n---'],
  ].map(([id, body]) => ({ id, source: `<div><pre>\n\n${body}\n\n</pre></div>\n` }))];
  let textBlockChecks = 0;
  for (const test of textBlockCases) for (const ending of ['\n', '\r\n']) {
    const source = test.source.replaceAll('\n', ending);
    const fallbacks = [];
    const imported = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    assert.equal(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown, source);
    assert.equal(fallbacks.length, 0, `${test.id}: text-block source projection must recover`);
    const actual = semanticProjection(HTMLExporter.export(imported.document, { document: false }));
    const expected = semanticProjection(referenceRenderer.render(referenceParser.parse(source)));
    assert.deepEqual(codeContent(actual), codeContent(expected), `${test.id}: exact reference code stream, including generated terminators`);
    if (test.id === 'table-pre') assert.deepEqual(actual, expected);
    else assert.notDeepEqual(actual, expected, `${test.id}: omitted outer div remains an explicit structural mismatch`);
    textBlockChecks++;
  }
  console.log(`Explicit structural source flow: ${textBlockChecks} LF/CRLF reference-code/source contracts. Paragraphs, headings, code, plain hard breaks and list/quote nesting supported; outer-div mismatches remain, other atoms still refused.`);
  let containerChecks = 0;
  for (const body of ['- one\n- two', '- one\n\n- two', '3. one\n4. two',
    '- one\n  - nested\n  - second\n- two', '- one\n\n  > quoted\n  > line\n\n- two',
    '> - one\n> - two', '- # Title\n- item', '> first\n>\n> > second',
    'one  \ntwo', 'one\\\ntwo', '- one  \n  two\n- three', '> one\\\n> two']) {
    for (const ending of ['\n', '\r\n']) {
      const source = `<blockquote>\n\n${body}\n\n</blockquote>\n`.replaceAll('\n', ending);
      const fallbacks = [];
      const imported = MarkdownImporter.parseWithSource(source, schema, {
        parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: issue => fallbacks.push(issue),
      });
      assert.equal(fallbacks.length, 0, `${body}: supported container projection`);
      assert.deepEqual(semanticProjection(HTMLExporter.export(imported.document, { document: false })),
        semanticProjection(referenceRenderer.render(referenceParser.parse(source))), `${body}: full list/quote reference structure`);
      assert.equal(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown, source);
      containerChecks++;
    }
  }
  console.log(`Structural source flow: ${containerChecks} LF/CRLF full reference-structure and exact-source contracts outside pre.`);
}
