import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, EditorState, MarkdownExporter, MarkdownImporter, Schema, StarterKit, composeExtensions, createEditor } from '../src';

describe('source boundaries with document-wide reference definitions', () => {
  it('validates distinct edits and separators while repeatedly exporting one source snapshot', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '[ref]: /target "Original"\n\n# Keep [link][ref] ###\n\n~~~~js\nfirst\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const [heading, code] = imported.document.content;
    const changedCode = code.copy([schema.text('Changed code.\n\nLast line.')]);
    const documents = [[heading, schema.node('paragraph', {}, [schema.text('First addition.')]), code],
      [code, heading], [changedCode, heading], [heading, code, schema.node('paragraph', {}, [schema.text('Second addition.')])],
      [heading, code], [code]];
    for (let pass = 0; pass < 3; pass++) for (const content of documents) {
      const document = imported.document.copy(content);
      const result = MarkdownExporter.exportWithSource(document, imported.source);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
    }
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
  });
  for (const ending of ['\n', '\r\n', '\r']) {
    it(`keeps an authored empty paragraph after editing a referenced document (${JSON.stringify(ending)})`, () => {
      const kit = composeExtensions(StarterKit.extensions), schema = new Schema(kit.schema);
      const source = ['[ref]: /target', '', '# Keep [link][ref] ###', '', '~~~~js', 'first', ''].join(ending);
      const imported = MarkdownImporter.parseWithSource(source, schema);
      const document = imported.document.copy([...imported.document.content, schema.node('paragraph', {}, [schema.text('')])]);
      const editor = createEditor({ schema: kit.schema, state: EditorState.create({ schema, doc: document, plugins: kit.plugins }) });
      try {
        expect(editor.state.doc.childCount).toBe(3);
        editor.dispatch(editor.state.createTransaction().insertText([0, 0], 0, 'Edited '));
        const result = MarkdownExporter.exportWithSource(editor.state.doc, imported.source);
        expect(result.markdown).toContain('<p data-fountain-empty="text"></p>');
        expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(editor.state.doc.toJSON());
      } finally { editor.destroy(); }
    });
    for (const blankCodeLine of [false, true]) {
      it.each(['move', 'append', 'edit-and-append', 'delete-heading', 'insert-before-fence'] as const)(
        `%s retains the complete document with references (${JSON.stringify(ending)}, blank code line ${blankCodeLine})`, action => {
          const schema = new Schema(CoreSchemaSpec);
          const source = ['[ref]: /target', '', '# Keep [link][ref] ###', '', '~~~~js',
            'first', ...(blankCodeLine ? ['', 'last'] : []), ''].join(ending);
          const imported = MarkdownImporter.parseWithSource(source, schema);
          expect(imported.document.content.map(node => node.type.name)).toEqual(['heading', 'code_block']);
          const [heading, code] = imported.document.content;
          const paragraph = schema.node('paragraph', {}, [schema.text('Keep appended text.')]);
          const changed = imported.document.copy(action === 'move' ? [code, heading]
            : action === 'delete-heading' ? [code] : action === 'insert-before-fence' ? [heading, paragraph, code]
              : [action === 'edit-and-append' ? heading.copy([schema.text('Changed heading.')]) : heading, code, paragraph]);
          const exported = MarkdownExporter.exportWithSource(changed, imported.source);
          expect(MarkdownImporter.parse(exported.markdown, schema).toJSON()).toEqual(changed.toJSON());
          if (imported.source.blocks.length && action !== 'edit-and-append' && action !== 'delete-heading') {
            expect(exported.markdown).toContain('# Keep [link][ref] ###');
          }
          expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
        });
    }
  }
});
