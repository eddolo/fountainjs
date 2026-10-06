/** Full-model checks shared by packed consumers, native runtimes and workerd. */
export function checkInertHTMLSource(core, server, inert) {
  const { Schema, CoreSchemaSpec, HTMLExporter, MarkdownImporter, MarkdownExporter, Editor, EditorState, createHistoryPlugin, undo, redo } = core;
  const extension = inert.createInertHTMLInlineExtension({ tags: ['foo', 'bar', 'lab.measurement'] });
  const rawExtension = inert.createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] });
  const blockExtension = inert.createInertHTMLBlockExtension({ tags: ['warning', 'lab-section'] });
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...extension.nodes, ...rawExtension.nodes, ...blockExtension.nodes } });
  const importer = new server.ServerHTMLImporter({ sourceTokens: true });
  const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };
  const source = "Before <FoO data-x='a'>outer <bar>inside</bar></FOO> after.\n";
  const captured = MarkdownImporter.parseWithSource(source, schema, options);
  const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
  const equal = (left, right, label) => { if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`Inert HTML ${label} changed the complete document.`); };
  try {
    const before = editor.getJSON();
    const tokens = editor.state.doc.child(0).child(1).attrs.tokens;
    equal(tokens, { startTag: "<FoO data-x='a'>", endTag: '</FOO>', origin: 'markdown-projection' }, 'lexical token provenance');
    let path;
    editor.state.doc.descendants((node, candidate) => { if (node.isText && node.text === 'inside') path = [...candidate]; });
    if (!path) throw new Error('Inert HTML nested editable text was not mapped.');
    editor.dispatch(editor.createTransaction().insertText(path, 6, ' revised'));
    const current = editor.getJSON();
    equal(schema.nodeFromJSON(JSON.parse(JSON.stringify(current))).toJSON(), current, 'native JSON reopen');
    equal(importer.parse(HTMLExporter.export(editor.state.doc, { document: false }), schema).toJSON(), current, 'HTML reopen');
    const canonical = MarkdownExporter.exportWithSource(editor.state.doc, captured.source);
    equal(MarkdownImporter.parse(canonical.markdown, schema, options).toJSON(), current, 'canonical Markdown reopen');
    if (!undo(editor)) throw new Error('Inert HTML undo failed.');
    equal(editor.getJSON(), before, 'undo');
    if (MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown !== source) throw new Error('Inert HTML undo changed untouched source.');
    if (!redo(editor)) throw new Error('Inert HTML redo failed.');
    equal(editor.getJSON(), current, 'redo');
    const direct = importer.parse("<p><lab.measurement data-x='a'>x</lab.measurement></p>", schema);
    if (direct.child(0).child(0).attrs.tokens.origin !== 'html-input') throw new Error('Direct HTML lost source provenance.');
    const ordinary = new server.ServerHTMLImporter().parse('<p><foo>x</foo></p>', schema);
    if (ordinary.child(0).child(0).attrs.tokens !== null) throw new Error('Default importer collected lexical tokens.');
    const modified = HTMLExporter.export(direct, { document: false }).replace('<span data-fountain-inert-content', 'Added text<span data-fountain-inert-content');
    if (!importer.parse(modified, schema).textContent.includes('Added text')) throw new Error('Modified carrier swallowed visible text.');
    // Check the actual packed/runtime parser, not just TS source tests. An
    // unfinished raw token must roll back conversion even with no protected
    // text nodes and after the bounded parser-error report is exhausted.
    const bounded = new server.ServerHTMLImporter({ maxParseErrors: 1 });
    for (const ending of ['\n', '\r\n']) for (const raw of [
      '<div id="foo"\n*hi*', '<div class\nfoo', '<div *???-&&&-<---\n*foo*', '<div x=1 x=2\nprivate-token',
    ]) for (const mode of ['flow', 'document']) {
      const input = raw.replaceAll('\n', ending) + ending;
      const fallbacks = [];
      const guarded = {
        ...(mode === 'flow' ? { parseHTMLFlow: bounded.parseFlow.bind(bounded) }
          : { parseHTMLDocument: bounded.parseTextBlockFlow.bind(bounded) }),
        onHTMLFlowFallback: issue => fallbacks.push(issue),
      };
      const result = MarkdownImporter.parseWithSource(input, schema, guarded);
      equal(result.document.toJSON(), MarkdownImporter.parse(input, schema).toJSON(), 'unfinished source fallback');
      if (!fallbacks.some(issue => issue.reason === 'error' && issue.message.includes('unfinished HTML tag'))) {
        throw new Error('Unfinished HTML conversion did not disclose its literal-source fallback.');
      }
      if (MarkdownExporter.exportWithSource(result.document, result.source).markdown !== input) {
        throw new Error('Unfinished HTML fallback changed untouched source.');
      }
      equal(MarkdownImporter.parse(MarkdownExporter.export(result.document), schema, guarded).toJSON(),
        result.document.toJSON(), 'unfinished source canonical reopen');
    }
    for (const ending of ['\n', '\r\n']) for (const [tag, body] of [
      ['script', '\n😀 <b>literal</b>\n\nglobalThis.rawPwned=1;\n'],
      ['style', '\nh1 {color:red;}\n\np {background:url(https://invalid.test/x);}\n'],
      ['textarea', '\n😀 &amp; <em>literal</em>\n'],
    ]) {
      const input = `<${tag} data-x='a'>${body}</${tag}>\nokay\n`.replaceAll('\n', ending);
      const failures = [];
      const result = MarkdownImporter.parseWithSource(input, schema, { ...options, onHTMLFlowFallback: issue => failures.push(issue) });
      const raw = result.document.child(0).child(0);
      const expected = tag === 'textarea' ? body.slice(1).replace('&amp;', '&') : body;
      if (raw.type.name !== 'html_inert_raw_text' || raw.textContent !== expected || failures.length) throw new Error('Inert raw-text runtime lost its literal value.');
      if (!raw.content.every(child => child.isText && !child.marks.length)) throw new Error('Inert raw-text runtime reinterpreted literal source.');
      const native = result.document.toJSON();
      const html = HTMLExporter.export(result.document, { document: false });
      if (/<(?:script|style|textarea)\b/iu.test(html)) throw new Error('Inert raw-text writer emitted an active element.');
      equal(importer.parse(html, schema).toJSON(), native, 'raw-text HTML reopen');
      equal(MarkdownImporter.parse(MarkdownExporter.export(result.document), schema, options).toJSON(), native, 'raw-text canonical reopen');
      if (MarkdownExporter.exportWithSource(result.document, result.source).markdown !== input) throw new Error('Inert raw-text runtime changed untouched source.');
      const session = new Editor(EditorState.create({ schema, doc: result.document, plugins: [createHistoryPlugin()] }));
      try {
        session.dispatch(session.createTransaction().insertText([0, 0, 0], 0, 'EDIT '));
        const edited = session.getJSON();
        if (!undo(session)) throw new Error('Inert raw-text undo failed.');
        equal(session.getJSON(), native, 'raw-text undo');
        if (!redo(session)) throw new Error('Inert raw-text redo failed.');
        equal(session.getJSON(), edited, 'raw-text redo');
      } finally { session.destroy(); }
    }
    const blockSource = '<lab-section onclick="bad()"><h2>Results</h2><ul><li>Check</li></ul><table><tr><td>12</td></tr></table><warning></warning></lab-section>';
    const importedBlock = importer.parse(blockSource, schema);
    const blockDoc = schema.topNodeType.create({}, [...importedBlock.content,
      schema.node('paragraph', {}, []), schema.node('paragraph', {}, [schema.text('')])]);
    if (blockDoc.child(0).type.name !== 'html_inert_block') throw new Error('Inert block wrapper was flattened.');
    equal(blockDoc.child(0).content.map(node => node.type.name), ['heading', 'bullet_list', 'table', 'html_inert_block'], 'block child structure');
    const blockSession = new Editor(EditorState.create({ schema, doc: blockDoc, plugins: [createHistoryPlugin()] }));
    try {
      if (!inert.appendInertHTMLBlockParagraph(blockSession, [0, 3])) throw new Error('Inert empty block did not accept explicit authoring.');
      blockSession.dispatch(blockSession.createTransaction().insertText([0, 3, 0, 0], 0, 'Reviewed'));
      const edited = blockSession.getJSON();
      equal(schema.nodeFromJSON(JSON.parse(JSON.stringify(edited))).toJSON(), edited, 'block native JSON reopen');
      equal(importer.parse(HTMLExporter.export(blockSession.state.doc, { document: false }), schema).toJSON(), edited, 'block HTML reopen');
      equal(MarkdownImporter.parse(MarkdownExporter.export(blockSession.state.doc), schema, options).toJSON(), edited, 'block canonical reopen');
      if (!undo(blockSession) || !undo(blockSession)) throw new Error('Inert block history failed.');
      equal(blockSession.getJSON(), blockDoc.toJSON(), 'block empty undo');
      if (!redo(blockSession) || !redo(blockSession)) throw new Error('Inert block redo failed.');
      equal(blockSession.getJSON(), edited, 'block redo');
    } finally { blockSession.destroy(); }
    return true;
  } finally { editor.destroy(); }
}
