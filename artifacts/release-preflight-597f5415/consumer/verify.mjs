import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
for (const mode of ['ESM', 'CommonJS']) {
  const load = mode === 'ESM' ? specifier => import(specifier) : specifier => require(specifier);
  const core = await load('fountainjs-editor/core');
  const { ServerHTMLImporter } = await load('fountainjs-editor/html/server');
  assert.equal(globalThis.window, undefined);
  assert.equal(globalThis.document, undefined);
  const kit = core.composeExtensions([core.defineExtension({
    name: 'release-consumer-document',
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
      text: { group: 'inline', inline: true },
    },
    commands: { insertText: core.insertText },
  })]);
  const schema = new core.Schema(kit.schema);
  const source = 'Candidate package.\n\nSecond paragraph.\n';
  const parsed = core.MarkdownImporter.parseWithSource(source, schema);
  assert.equal(core.MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown, source);
  const editor = core.createEditor({ schema: kit.schema, plugins: kit.plugins, content: parsed.document.toJSON() });
  editor.dispatch(editor.createTransaction().setSelection(core.Selection.cursor([0, 0], 'Candidate package.'.length)));
  assert.equal(core.createCommandManager(editor, kit.commands).commands.insertText(' Verified.'), true);
  assert.equal(editor.state.doc.child(0).textContent, 'Candidate package. Verified.');
  editor.state.schema.validate(editor.state.doc);
  const imported = ServerHTMLImporter.parseWithReport('<html><head><title>Hidden</title></head><body><p>Visible body.</p></body></html>', schema);
  assert.equal(imported.document.textContent, 'Visible body.');
  assert.ok(imported.issues.some(issue => issue.code === 'document-shell-omitted'));
  assert.equal(core.HTMLExporter.export(imported.document, { document: false }).includes('Hidden'), false);
  editor.destroy();
  assert.equal(globalThis.window, undefined);
  assert.equal(globalThis.document, undefined);
  console.log(`${mode}: installed tarball schema, extensions, transactions, exact Markdown and server HTML passed without browser globals or optional peers.`);
}
