/** Actual emitted/package consumers: no DOM shim and no reference parser. */
export function checkHTMLLinkControls(core, server) {
  const { Schema, CoreSchemaSpec, HTMLContainerExtension, HTMLCommentExtension, HTMLFlowExtension,
    MarkdownImporter, MarkdownExporter, HTMLExporter, Editor, EditorState, createHistoryPlugin, undo, redo } = core;
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    ...HTMLContainerExtension.nodes, ...HTMLCommentExtension.nodes, ...HTMLFlowExtension.nodes } });
  const importer = new server.ServerHTMLImporter();
  const equal = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`HTML link ${label} differs.`); };
  const links = doc => {
    const values = [];
    doc.descendants(node => node.marks.forEach(mark => { if (mark.type.name === 'link') values.push(mark.attrs.href); }));
    return values;
  };
  let checks = 0;
  const escape = value => value.replace(/[&<>"\t\n\r]/gu, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? `&#${c.charCodeAt(0)};`));
  for (const source of ['foo\\bar', '/bar\\/)', 'foo  \nbar', 'foo\\\nbar', 'folder/\tname', '#note\rpart',
    'https://example.test/path?q=a\nb', 'folder\\quote"and&<angle>']) {
    const doc = importer.parse(`<p>Before <a href="${escape(source)}">label</a> after.</p>`, schema);
    const native = doc.toJSON();
    const attrs = native.content[0].content[1].marks[0].attrs;
    if (attrs.htmlHref !== source) throw new Error('HTML source navigation metadata missing.');
    const dom = doc.content[0].content[1].marks[0].type.spec.toDOM(doc.content[0].content[1].marks[0]);
    equal(dom[1].href, source.replace(/[\t\n\r]/gu, ''), 'HTML navigation href');
    equal(new URL(dom[1].href, 'https://example.test/demos/page').href, new URL(source, 'https://example.test/demos/page').href, 'HTML actual URL interpretation');
    equal(importer.parse(HTMLExporter.export(doc, { document: false }), schema).toJSON(), native, 'HTML source-bound reopen');
    equal(schema.nodeFromJSON(JSON.parse(JSON.stringify(native))).toJSON(), native, 'HTML JSON reopen');
    for (const linkStyle of ['inline', 'reference']) {
      equal(MarkdownImporter.parse(MarkdownExporter.export(doc, { linkStyle }), schema,
        { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) }).toJSON(), native, 'HTML source-bound Markdown reopen');
    }
    const editor = new Editor(EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }));
    try {
      editor.dispatch(editor.createTransaction().insertText([0, 1], 0, 'edited '));
      const edited = editor.getJSON();
      undo(editor); equal(editor.getJSON(), native, 'HTML source-bound undo');
      redo(editor); equal(editor.getJSON(), edited, 'HTML source-bound redo');
    } finally { editor.destroy(); }
    checks++;
  }
  for (const source of ['java\nscript:bad', '//evil.test/\npath', 'wrong\\path', 'safe', `a${'\t'.repeat(2048)}`]) {
    const imported = importer.parseWithReport(`<p><a href="safe/path" data-fountain-html-href="${escape(source)}">label</a></p>`, schema);
    equal(imported.document.content[0].content[0].marks[0].attrs, { href: 'safe/path', title: '', target: '_blank' }, 'forged HTML carrier');
    if (!imported.issues.some(issue => issue.code === 'invalid-rule-result')) throw new Error('Invalid HTML source carrier was not reported.');
    if (imported.issues.some(issue => issue.message.includes(source))) throw new Error('Invalid source carrier leaked in diagnostics.');
    checks++;
  }
  for (const href of ['foo\\bar', '/url\\bar*baz', 'https://example.com?find=\\*', 'https://example.com/\\[\\']) {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('label', [schema.mark('link', { href })])])]);
    const html = HTMLExporter.export(doc, { document: false });
    if (!html.includes(`href="${href.replaceAll('\\', '%5C')}"`)) throw new Error('HTML link browser destination differs.');
    equal(importer.parse(html, schema).toJSON(), doc.toJSON(), 'bound native backslash spelling');
    checks++;
  }
  for (const carrier of ['javascript:alert(1)\\x', '//evil.test/\\x', 'different\\path', `a${'\\'.repeat(2_048)}`, 'safe']) {
    const imported = importer.parseWithReport(`<p><a href="safe%5Cpath" data-fountain-link-href="${carrier}">label</a></p>`, schema);
    equal(links(imported.document), ['safe%5Cpath'], 'forged carrier');
    if (!imported.issues.some(issue => issue.code === 'invalid-rule-result')) throw new Error('Invalid native link carrier was not reported.');
    checks++;
  }
  {
    const href = 'https://safe.test\\@evil.test/path';
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('label', [schema.mark('link', { href })])])]);
    const html = HTMLExporter.export(doc, { document: false });
    if (!html.includes(`href="${href}"`) || new URL(href).hostname !== 'safe.test') throw new Error('Link authority interpretation changed.');
    equal(importer.parse(html, schema).toJSON(), doc.toJSON(), 'unchanged authority');
    checks++;
  }
  for (const [href, expected] of [['foo  \nbar', 'foo  %0Abar'], ['foo\\\nbar', 'foo%5C%0Abar'],
    ['/folder/\tname', '/folder/%09name'], ['#note&#13;part', '#note%0Dpart'],
    ['https://example.test/path?q=a\nb', 'https://example.test/path?q=a%0Ab']]) {
    const imported = importer.parseWithReport(`<p><a href="${href}">label</a></p>`, schema);
    equal(links(imported.document), [expected], 'control-data import');
    if (!imported.issues.some(issue => issue.code === 'normalized-link-url')) throw new Error('HTML link normalization was not reported.');
    equal(importer.parse(HTMLExporter.export(imported.document, { document: false }), schema).toJSON(), imported.document.toJSON(), 'HTML reopen');
    equal(MarkdownImporter.parse(MarkdownExporter.export(imported.document), schema, { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) }).toJSON(), imported.document.toJSON(), 'Markdown reopen');
    checks++;
  }
  for (const ending of ['\n', '\r\n']) for (const href of ['foo  \nbar', 'foo\\\nbar']) {
    const source = `<a href="${href}">\n`.replaceAll('\n', ending);
    const captured = MarkdownImporter.parseWithSource(source, schema, { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) });
    const expected = href.replaceAll('\\', '%5C').replaceAll('\n', '%0A');
    equal(links(captured.document), [expected, expected], 'empty link boundaries');
    if (MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== source) throw new Error('HTML link original source changed.');
    const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
    try {
      const original = editor.getJSON();
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'label'));
      const edited = editor.getJSON();
      equal(importer.parse(HTMLExporter.export(editor.state.doc, { document: false }), schema).toJSON(), edited, 'edited HTML');
      undo(editor); equal(editor.getJSON(), original, 'undo');
      redo(editor); equal(editor.getJSON(), edited, 'redo');
    } finally { editor.destroy(); }
    checks++;
  }
  for (const base of ['javascript:alert(1)', 'vbscript:payload', 'data:text/html,bad', '//evil.test/path', '\\evil.test']) {
    for (const control of ['\t', '\n', '\r']) for (let at = 0; at <= base.length; at++) {
      const href = base.slice(0, at) + control + base.slice(at);
      const result = importer.parseWithReport(`<p><a href="${href}">visible</a></p>`, schema);
      equal(links(result.document), [], 'disguised unsafe destination');
      if (result.document.textContent !== 'visible' || !result.issues.some(issue => issue.code === 'rejected-url')) throw new Error('HTML link unsafe fallback failed.');
      checks++;
    }
  }
  for (const href of ['custom:payload', 'mailto:a\nb@example.test', 'https://exa\nmple.test/path',
    'https://safe.test\\@evil.test/path\n', 'https://safe.test\n/path', 'x\u0001y', 'x\u007fy', 'h\nttps://example.test/path', '/\\evil.test\n']) {
    const result = importer.parseWithReport(`<p><a href="${href}">visible</a></p>`, schema);
    equal(links(result.document), [], 'unsafe authority/control/scheme');
    if (!result.issues.some(issue => issue.code === 'rejected-url')) throw new Error('HTML link authority rejection was not reported.');
    checks++;
  }
  const expanded = importer.parseWithReport(`<p><a href="folder/${'\t'.repeat(700)}">visible</a></p>`, schema);
  equal(links(expanded.document), [], 'over-limit normalized destination');
  if (!expanded.issues.some(issue => issue.code === 'invalid-rule-result' && issue.contribution === 'mark:link')) throw new Error('HTML link expansion failure was not reported.');
  checks++;
  for (const suffix of Array.from('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')) {
    for (const href of [`folder\\${suffix}file`, `folder\\\\${suffix}file`, `https://example.test/folder\\${suffix}file`]) {
      const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('label', [schema.mark('link', { href })])])]);
      equal(importer.parse(HTMLExporter.export(doc, { document: false }), schema).toJSON(), doc.toJSON(), 'punctuation HTML carrier');
      for (const linkStyle of ['inline', 'reference']) {
        equal(MarkdownImporter.parse(MarkdownExporter.export(doc, { linkStyle }), schema).toJSON(), doc.toJSON(), 'backslash destination');
        checks++;
      }
    }
  }
  return checks;
}
