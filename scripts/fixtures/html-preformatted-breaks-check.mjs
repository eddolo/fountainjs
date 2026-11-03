/** Public-package contracts without DOM globals or Node built-ins. */
export function checkHTMLPreformattedBreaks(core, html, spec = core.CoreSchemaSpec) {
  const schema = new core.Schema(spec);
  const cases = [
    ['<pre>first<br>second</pre>', 'first\nsecond'],
    ['<pre>first<br>\nsecond</pre>', 'first\n\nsecond'],
    ['<pre><br>second<br></pre>', '\nsecond\n'],
    ['<pre>\nfirst<br><br>second\n</pre>', 'first\n\nsecond\n'],
    ['<pre><code>first<br>second</code></pre>', 'first\nsecond'],
    ['<pre><span>first<br></span><em>second</em></pre>', 'first\nsecond'],
    ['<pre>&lt;br&gt; &amp; \t😀<br>&#13;\nend</pre>', '<br> & \t😀\n\r\nend'],
    ['<pre>first<!-- private-token --><br>second</pre>', 'first\nsecond'],
  ];
  let checks = 0;
  for (const [source, expected] of cases) {
    const doc = html.ServerHTMLImporter.parse(source, schema);
    if (doc.child(0).type.name !== 'code_block' || doc.textContent !== expected) throw Error('Preformatted HTML lost a physical break.');
    for (const document of [false, true]) {
      const reopened = html.ServerHTMLImporter.parse(core.HTMLExporter.export(doc, { document }), schema);
      if (JSON.stringify(reopened.toJSON()) !== JSON.stringify(doc.toJSON())) throw Error('Preformatted HTML changed on native reopen.');
    }
    checks++;
  }
  const reported = html.ServerHTMLImporter.parseWithReport('<pre id="private-id">first <em>important</em> second</pre>', schema);
  if (!reported.issues.some(issue => issue.code === 'preformatted-html-projection')
    || JSON.stringify(reported.issues).includes('private-id')) throw Error('Preformatted projection report missing or discloses source.');
  checks++;
  if (html.ServerHTMLImporter.parseWithReport('<pre><code class="language-js">plain\ncode</code></pre>', schema).issues.length) {
    throw Error('Canonical plain code gained a projection warning.');
  }
  checks++;
  const source = '<div><pre>\n\none<br>\ntwo\n\n</pre></div>\n';
  let fallback = false;
  const captured = core.MarkdownImporter.parseWithSource(source, schema, { parseHTMLFlow: html.ServerHTMLImporter.parseTextBlockFlow,
    onHTMLFlowFallback: () => { fallback = true; } });
  if (fallback || captured.document.textContent !== 'one\n\ntwo\n'
    || core.MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== source) {
    throw Error('Protected preformatted Markdown breaks or exact source changed.');
  }
  return checks + 1;
}
