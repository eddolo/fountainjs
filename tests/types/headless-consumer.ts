import {
  HTMLExporter,
  JSONExporter,
  MarkdownExporter,
  MarkdownImporter,
  Plugin,
  Schema,
  TextExporter,
  composeExtensions,
  createCommandManager,
  createCoreCollaborationExtension,
  createEditor,
  createHistoryPlugin,
  defineExtension,
  insertText,
  type SchemaSpec,
} from 'fountainjs-editor/core';

const documentExtension = defineExtension({
  name: 'headless-document',
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseHTML: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline', inline: true },
  },
  marks: {
    strong: {
      parseHTML: [{ tag: 'strong' }],
      toDOM: () => ['strong', 0],
    },
  },
  commands: { insertText },
});

const collaborationExtension = createCoreCollaborationExtension({
  adapter: () => ({ connect() {} }),
});
const kit = composeExtensions([documentExtension, collaborationExtension]);
const schemaSpec: SchemaSpec = kit.schema;
const schema = new Schema(schemaSpec);
const editor = createEditor({
  schema: schemaSpec,
  plugins: [...kit.plugins, new Plugin({}), createHistoryPlugin()],
  content: schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('portable')])]),
});
const commands = createCommandManager(editor, kit.commands);
commands.commands.insertText(editor, ' core');

JSONExporter.export(editor.state);
HTMLExporter.export(editor.state, { document: false });
MarkdownExporter.export(editor.state);
const sourcedMarkdown = MarkdownImporter.parseWithSource('---\ntitle: Portable\n---\n**portable**', schema);
const exactMarkdown: string = MarkdownExporter.exportWithSource(
  sourcedMarkdown.document,
  sourcedMarkdown.source,
).markdown;
void exactMarkdown;
MarkdownImporter.parse('**portable**', schema);
TextExporter.export(editor.state);
editor.destroy();
