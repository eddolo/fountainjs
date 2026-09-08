import assert from 'node:assert/strict';

export function checkMarkdownCodeLabels({ schema, MarkdownImporter, MarkdownExporter,
  HTMLExporter, referenceParser, referenceRenderer, referenceOutput, semanticProjection }) {
  const infos = ['x"y', "x'y", '<script>', 'x'.repeat(100), 'constructor', '__proto__',
    'c++', 'c#', '日本語', 'a&amp;b', 'a\\&amp;b', 'a&#32;b', 'a&#10;b', '&#32;a',
    '&#96;name', '&#126;name', 'a&#92;b'];
  let checked = 0;
  for (const info of infos) for (const ending of ['\n', '\r\n']) {
    const source = ['```' + info, 'x', '```', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const expected = referenceOutput(referenceRenderer, referenceParser.parse(source)).projection;
    const actual = semanticProjection(HTMLExporter.export(imported.document, { document: false }));
    assert.deepEqual(actual, expected, `${info}: full reference semantics without changing the comparator`);
    assert.equal(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown, source);
    const canonical = MarkdownExporter.export(imported.document);
    assert.deepEqual(MarkdownImporter.parse(canonical, schema).toJSON(), imported.document.toJSON(), `${info}: canonical label/body retention`);
    assert.deepEqual(referenceOutput(referenceRenderer, referenceParser.parse(canonical)).projection, expected, `${info}: canonical file keeps reference meaning`);
    checked++;
  }
  console.log(`Code labels: ${checked} LF/CRLF full reference-semantic, exact-source and canonical round-trip contracts passed.`);
}
