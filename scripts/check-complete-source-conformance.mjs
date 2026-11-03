import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'parse5';

/** Independent complete-file context and source-data oracle. This does not
 * reduce Fountain's AST to CommonMark's AST or waive body semantic differences.
 */
export function inspectCompleteSource(document, html) {
  const errors = [];
  const parsed = parse(html, { sourceCodeLocationInfo: true, onParseError: error => errors.push(error.code) });
  const shell = parsed.childNodes.find(node => node.tagName === 'html');
  const body = shell?.childNodes.find(node => node.tagName === 'body');
  if (!body) throw Error('Complete source has no parsed body.');
  const doctype = parsed.childNodes.find(node => node.nodeName === '#documentType');
  const envelope = document.attrs.htmlSourceEnvelope;
  if (envelope !== undefined) {
    if (parsed.mode !== envelope.mode) throw Error('Complete source changed the stored compatibility mode.');
    const spelling = doctype?.sourceCodeLocation ? html.slice(doctype.sourceCodeLocation.startOffset, doctype.sourceCodeLocation.endOffset) : null;
    if (spelling !== envelope.doctype) throw Error('Complete source changed or lost the stored declaration.');
  } else if (!doctype || doctype.name !== 'html' || doctype.publicId || doctype.systemId || parsed.mode !== 'no-quirks') {
    throw Error('Complete source changed the declared default HTML5 envelope policy.');
  }
  const eof = [];
  document.descendants((node, path) => { if (node.type.name === 'html_source_eof') eof.push({ node, path }); });
  if (eof.length) {
    const { node, path } = eof[0];
    if (eof.length !== 1 || path.length !== 1 || path[0] !== document.childCount - 1
      || !html.endsWith(node.textContent) || !errors.includes('eof-in-tag')) {
      throw Error('Complete source lost, changed, completed or moved its retained EOF tail.');
    }
  } else if (errors.includes('eof-in-tag')) throw Error('Complete source introduced an unowned EOF tag.');
  return { nodes: body.childNodes, mode: parsed.mode, declarationChecked: envelope !== undefined, eofChecked: eof.length > 0 };
}

function ranges(source) {
  const result = new Set();
  for (const part of source.split(',').filter(Boolean)) {
    assert.match(part, /^\d+(?:-\d+)?$/u, 'Invalid complete-source fixture range.');
    const [from, to = from] = part.split('-').map(Number);
    assert.ok(from >= 1 && to >= from && to <= 652, 'Complete-source ranges must be bounded CommonMark example IDs.');
    for (let number = from; number <= to; number++) result.add(number);
  }
  return result;
}

function modelDifferences(before, after, path = '$', changes = []) {
  if (changes.length >= 12 || JSON.stringify(before) === JSON.stringify(after)) return changes;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) modelDifferences(before[key], after[key], `${path}.${key}`, changes);
  } else changes.push({ path, before: before ?? null, after: after ?? null });
  return changes;
}

// Corrupt otherwise valid output deliberately. A body match alone must not hide
// deleted source data; a retained declaration/tail must not hide corrupted prose.
function checkOracleSensitivity(engine, schema, options, projectBodyNodes, referenceProjection) {
  let checks = 0;
  const check = (name, action) => { try { action(); checks++; } catch (error) { throw Error(`Complete-source oracle control ${name}: ${error.message}`, { cause: error }); } };
  const output = doc => {
    const result = engine.exportHTMLSource(doc);
    assert.ok(result.ok, JSON.stringify(result.issues));
    return result.sourceHTML;
  };
  const body = html => {
    const root = parse(html).childNodes.find(node => node.tagName === 'html');
    return root.childNodes.find(node => node.tagName === 'body').childNodes;
  };
  const source = 'Before **evidence**.\n\n<div title="unfinished\n';
  const doc = engine.MarkdownImporter.parse(source, schema, options), html = output(doc);
  const tail = doc.child(doc.childCount - 1).textContent;
  const prefix = html.slice(0, -tail.length);
  check('valid retained EOF', () => assert.equal(inspectCompleteSource(doc, html).eofChecked, true));
  for (const [name, corrupted] of [
    ['dropped EOF', prefix],
    ['changed EOF', prefix + tail.replace('unfinished', 'changed')],
    ['generated closing shell', html + '</body></html>'],
    ['completed EOF', html + '\">'],
  ]) check(name, () => assert.throws(() => inspectCompleteSource(doc, corrupted), /EOF tail/));
  check('body equality cannot excuse deleted EOF', () => {
    assert.deepEqual(projectBodyNodes(body(prefix)), projectBodyNodes(body(html)));
    assert.throws(() => inspectCompleteSource(doc, prefix), /EOF tail/);
  });
  check('EOF retention cannot excuse deleted prose', () => {
    const changed = html.replace('Before', 'Changed');
    assert.equal(inspectCompleteSource(doc, changed).eofChecked, true);
    assert.notDeepEqual(projectBodyNodes(body(changed)), referenceProjection(source));
  });
  const paragraph = schema.nodes.paragraph.create({}, [schema.text('Following')]);
  for (const [name, content] of [
    ['moved EOF model', [...doc.content, paragraph]],
    ['duplicate EOF model', [...doc.content, doc.child(doc.childCount - 1)]],
    ['nested EOF model', [schema.nodes.blockquote.create({}, doc.content)]],
  ]) check(name, () => assert.throws(() => inspectCompleteSource(schema.topNodeType.create({}, content), html), /EOF tail/));
  const plain = engine.MarkdownImporter.parse('Visible\n', schema, options), plainHTML = output(plain);
  check('valid generated HTML5 shell', () => assert.equal(inspectCompleteSource(plain, plainHTML).declarationChecked, false));
  check('unowned EOF', () => assert.throws(() => inspectCompleteSource(plain, plainHTML + '<div title="unfinished'), /unowned EOF/));
  check('default envelope policy', () => assert.throws(() => inspectCompleteSource(plain, plainHTML.replace(/<!doctype html>/iu, '')), /HTML5 envelope/));
  const declaration = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">';
  const declared = engine.MarkdownImporter.parse(declaration + '\n', schema, options), declaredHTML = output(declared);
  check('valid authored quirks declaration', () => {
    assert.equal(inspectCompleteSource(declared, declaredHTML).declarationChecked, true);
    assert.equal(inspectCompleteSource(declared, declaredHTML).mode, 'quirks');
  });
  for (const [name, replacement] of [
    ['dropped authored declaration', ''],
    ['changed public identifier', declaration.replace('Transitional', 'Frameset')],
    ['changed declaration spelling', declaration.replace('DOCTYPE', 'doctype')],
    ['changed compatibility mode', '<!doctype html>'],
  ]) check(name, () => assert.throws(() => inspectCompleteSource(declared, declaredHTML.replace(declaration, replacement)), /declaration|compatibility mode/));
  console.log(`Complete-source oracle sensitivity: ${checks} positive/negative controls; body, declaration and EOF data stay independent.`);
  return checks;
}

export function checkCompleteSourceConformance({ engine, examples, referenceProjection, projectBodyNodes, materializeTabs, projectionVersion,
  reportOnly = false, reportPath }) {
  const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/markdown/commonmark-complete-source-v1.json', import.meta.url), 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.standard, 'CommonMark 0.31.2');
  assert.equal(fixture.projectionVersion, projectionVersion, 'Complete source must use the existing neutral comparator version.');
  assert.equal(examples.length, 652);
  const required = ranges(fixture.requiredMatchRanges), unresolved = ranges(fixture.unresolvedRanges);
  const frontmatterDivergences = ranges(fixture.sourceCaptureFrontmatterDivergences);
  for (let number = 1; number <= 652; number++) if (Number(required.has(number)) + Number(unresolved.has(number)) !== 1) throw Error(`Complete source case ${number} needs one classification.`);
  const extensions = [engine.HTMLContainerExtension, engine.HTMLCommentExtension, engine.HTMLFlowExtension, engine.HTMLAnchorExtension,
    engine.createInertHTMLAnchorExtension(), engine.createHTMLSourceEmptyBodyExtension(), engine.createHTMLSourceEOFExtension(),
    engine.createInertHTMLInlineExtension({ tags: ['foo', 'bar', 'warning', 'bab', 'c2c', 'b2', 'responsive-image'] }),
    engine.createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] })];
  const schema = new engine.Schema({ ...engine.CoreSchemaSpec, nodes: { ...engine.CoreSchemaSpec.nodes, ...Object.assign({}, ...extensions.map(extension => extension.nodes)) } });
  const oracleControls = checkOracleSensitivity(engine, schema, { parseHTMLDocument: engine.createHTMLSourceMarkdownAdapter({ sourceTokens: true }) }, projectBodyNodes, referenceProjection);
  const records = [], counts = new Map(), captureCounts = new Map();
  let sourceChecks = 0, jsonChecks = 0, declarationChecks = 0, eofChecks = 0, safeHTMLMatches = 0, captureBodyMatches = 0;
  const modelStatuses = {};
  for (const example of examples) for (const ending of ['\n', '\r\n']) {
    const source = materializeTabs(example.markdown).replaceAll('\n', ending);
    const issues = [], fallbacks = [];
    const options = { parseHTMLDocument: engine.createHTMLSourceMarkdownAdapter({ sourceTokens: true }, report => issues.push(...report.issues)),
      onHTMLFlowFallback: issue => fallbacks.push(issue) };
    // These are deliberately separate public routes. parse() follows CommonMark;
    // parseWithSource() additionally recognizes inert YAML frontmatter. Retention
    // must not be mistaken for CommonMark body agreement on either route.
    const doc = engine.MarkdownImporter.parse(source, schema, options);
    const captured = engine.MarkdownImporter.parseWithSource(source, schema, options);
    if (engine.MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== source) throw Error(`Complete source snapshot changed ${example.number}/${JSON.stringify(ending)}.`);
    sourceChecks++;
    const original = JSON.stringify(doc.toJSON());
    if (JSON.stringify(schema.nodeFromJSON(JSON.parse(original)).toJSON()) !== original) throw Error(`Native JSON changed ${example.number}.`);
    jsonChecks++;
    const safeReopened = new engine.ServerHTMLImporter().parse(engine.HTMLExporter.export(doc), schema).toJSON();
    const safeHTMLMatch = JSON.stringify(safeReopened) === original;
    if (safeHTMLMatch) safeHTMLMatches++;
    const output = engine.exportHTMLSource(doc);
    const expected = referenceProjection(source);
    const captureOutput = engine.exportHTMLSource(captured.document);
    const captureBodyMatched = captureOutput.ok && JSON.stringify(projectBodyNodes(inspectCompleteSource(captured.document, captureOutput.sourceHTML).nodes)) === JSON.stringify(expected);
    if (captureBodyMatched) { captureBodyMatches++; captureCounts.set(example.number, (captureCounts.get(example.number) ?? 0) + 1); }
    const sameCapturedModel = JSON.stringify(captured.document.toJSON()) === original;
    assert.equal(!sameCapturedModel, frontmatterDivergences.has(example.number), `Review parse/source-capture model divergence ${example.number}.`);
    if (!sameCapturedModel) assert.ok(captured.source.frontmatter, 'A declared frontmatter divergence needs captured frontmatter.');
    let actual, inspection;
    if (output.ok) {
      inspection = inspectCompleteSource(doc, output.sourceHTML);
      actual = projectBodyNodes(inspection.nodes);
      declarationChecks += Number(inspection.declarationChecked); eofChecks += Number(inspection.eofChecked);
      modelStatuses[output.modelRoundTrip] = (modelStatuses[output.modelRoundTrip] ?? 0) + 1;
    } else actual = { refused: output.issues };
    const matched = JSON.stringify(actual) === JSON.stringify(expected);
    if (matched) counts.set(example.number, (counts.get(example.number) ?? 0) + 1);
    records.push({ number: example.number, ending, matched, captureBodyMatched, sameCapturedModel, safeHTMLMatch, sourceOK: output.ok,
      ...(output.ok ? { modelRoundTrip: output.modelRoundTrip } : { exportIssues: output.issues }),
      declarationChecked: inspection?.declarationChecked ?? false, eofChecked: inspection?.eofChecked ?? false,
      ...(!safeHTMLMatch ? { safeHTMLDifferences: modelDifferences(doc.toJSON(), safeReopened) } : {}),
      ...(output.ok && output.modelRoundTrip === 'different' ? { sourceModelIssues: output.issues } : {}),
      ...(!matched ? { source, expected, actual, issues, fallbacks } : {}) });
  }
  const matching = [...counts].filter(([, count]) => count === 2).map(([number]) => number);
  const capturedMatching = [...captureCounts].filter(([, count]) => count === 2).map(([number]) => number);
  const regressions = [...required].filter(number => counts.get(number) !== 2), gains = [...unresolved].filter(number => counts.has(number));
  const report = { profile: fixture.profile, projectionVersion: fixture.projectionVersion, matching: matching.length, total: 652,
    oracleControls, sourceChecks, jsonChecks, declarationChecks, eofChecks, safeHTMLMatches, safeHTMLTotal: records.length, modelStatuses,
    capturedMatchingExamples: capturedMatching, captureBodyMatches, captureBodyTotal: records.length, sourceCaptureFrontmatterDivergences: [...frontmatterDivergences],
    regressions, gains, matchingExamples: matching, records };
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Complete-document source BODY profile: ${matching.length}/652; ${sourceChecks} exact-source and ${jsonChecks} native-JSON checks; ${declarationChecks} declaration / ${eofChecks} EOF checks.`);
  console.log(`Complete source retention diagnostics: ${safeHTMLMatches}/${records.length} exact safe-HTML model reopens; source model statuses ${JSON.stringify(modelStatuses)}. Neither is body semantic conformance.`);
  console.log(`Source-capture body diagnostics: ${capturedMatching.length}/652 on both line endings (${captureBodyMatches}/${records.length} checks); frontmatter route differs from parse() only in examples ${[...frontmatterDivergences].join(',')}.`);
  if (regressions.length) throw Error(`Complete source semantic regressions: ${regressions.join(',')}`);
  if (gains.length && !reportOnly) throw Error(`Review complete source gains before promotion: ${gains.join(',')}`);
  return report;
}
