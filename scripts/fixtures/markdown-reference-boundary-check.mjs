export function checkMarkdownReferenceBoundaries(api, specification = api.CoreSchemaSpec) {
  const schema = new api.Schema(specification);
  let checks = 0;
  for (const ending of ['\n', '\r\n', '\r']) {
    const source = ['[ref]: /target "Original"', '', '# Keep [link][ref] ###', '', '~~~~js', 'first', ''].join(ending);
    const imported = api.MarkdownImporter.parseWithSource(source, schema);
    const [heading, code] = imported.document.content;
    const paragraph = schema.node('paragraph', {}, [schema.text('Keep appended text.')]);
    for (const content of [[code, heading], [heading, code, paragraph], [code], [heading, paragraph, code]]) {
      let changed = imported.document.copy(content);
      if (content[1] === paragraph && content[2] === code) {
        const editor = api.createEditor({ schema: specification, state: api.EditorState.create({ schema, doc: imported.document }) });
        try {
          const last = heading.childCount - 1;
          editor.dispatch(editor.state.createTransaction().setSelection(api.Selection.cursor([0, last], heading.child(last).text.length)));
          if (!api.splitBlock(editor) || !api.insertText(editor, 'Keep appended text.')) throw Error('Portable structural editor commands failed.');
          changed = editor.state.doc;
          if (changed.child(1).content.some(node => node.marks.some(mark => mark.type.name === 'link'))) {
            throw Error('A new paragraph inherited the preceding heading hyperlink.');
          }
        } finally { editor.destroy(); }
      }
      const result = api.MarkdownExporter.exportWithSource(changed, imported.source);
      const reopened = api.MarkdownImporter.parse(result.markdown, schema);
      if (JSON.stringify(reopened.toJSON()) !== JSON.stringify(changed.toJSON())) {
        throw Error('Reference-scoped Markdown export consumed a block or its definition footer.');
      }
      if (content.includes(heading) && !result.markdown.includes('# Keep [link][ref] ###')) {
        throw Error('Reference-scoped repair rewrote the unrelated heading source.');
      }
      if (api.MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== source) {
        throw Error('Reference-scoped repair mutated original source ownership.');
      }
      checks++;
    }
  }
  return checks;
}
