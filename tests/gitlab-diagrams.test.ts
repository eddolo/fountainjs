import { afterEach, expect, it } from 'vitest';
import { Selection, insertText, undo, redo, type Node } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import data from '../integrations/gitlab/fixtures/diagram-live-html.json';
const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
async function load(name: string) {
  const fixture = data.fixtures.find(item => item.name === name)!;
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async () => ({ body: fixture.body }) });
  services.push(service);
  await service.setSerializedContent(fixture.source);
  let path: readonly number[] = [], block!: Node;
  service.editor.state.doc.descendants((node, at) => { if (node.type.name === 'code_block') { path = at; block = node; } });
  expect(block).toBeDefined();
  service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([...path, 0], block.textContent.length)));
  return { service, editor: service.editor, fixture, block, path };
}

it.each(['mermaid', 'mermaid-unicode', 'mermaid-empty', 'mermaid-invalid', 'mermaid-nested', 'mermaid-list',
  'plantuml', 'plantuml-unicode', 'mixed'])('imports actual %s source and keeps direct native editing/undo', async name => {
  const { service, editor, fixture, block, path } = await load(name);
  expect(service.getSerializedContent()).toBe(fixture.source);
  expect(block.attrs.language).toBe(name.startsWith('plantuml') ? 'plantuml' : 'mermaid');
  expect(insertText(editor, '\n  %% Edited source')).toBe(true);
  const updated = path.reduce((node, index) => node.child(index), editor.state.doc);
  expect(updated.textContent).toBe(block.textContent + '\n  %% Edited source');
  const saved = service.getSerializedContent();
  expect(saved).toContain('```' + String(block.attrs.language));
  expect(saved).toContain('%% Edited source');
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(fixture.source);
  expect(redo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(saved);
  expect(typeof globalThis.document).toBe('undefined');
});

it.each(['mermaid', 'plantuml'])('converts a captured %s block to ordinary code and back without changing source', async language => {
  const { service, editor, block, path } = await load(language);
  expect(service.beginCodeEdit().applyLanguage('text')).toBe(true);
  expect(service.getSerializedContent()).toContain('```text');
  expect(service.beginCodeEdit().applyLanguage(language)).toBe(true);
  const current = path.reduce((node, index) => node.child(index), editor.state.doc);
  expect(current.textContent).toBe(block.textContent); expect(current.attrs.language).toBe(language);
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toContain('```text');
});

it('continues refusing unrepresented diagram fence parameters without modifying the source', async () => {
  const fixture = data.fixtures.find(item => item.name === 'mermaid-fence-params')!;
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async () => ({ body: fixture.body }) });
  services.push(service);
  await expect(service.setSerializedContent(fixture.source)).rejects.toThrow();
  expect(service.recovery?.markdown).toBe(fixture.source);
});

it.each([
  ['missing source', (html: string) => html.replace(/ data-diagram-src="[^"]*"/u, '')],
  ['invalid base64', (html: string) => html.replace(/data:text\/plain;base64,[^"]*/u, 'data:text/plain;base64,%%%')],
  ['invalid UTF-8', (html: string) => html.replace(/data:text\/plain;base64,[^"]*/u, 'data:text/plain;base64,////')],
  ['unsafe address', (html: string) => html.replace(/href="[^"]*"/u, 'href="javascript:alert(1)"')],
  ['extra visible content', (html: string) => html.replace('</a>', '<span>Unrepresented caption</span></a>')],
  ['extra metadata', (html: string) => html.replace('<a ', '<a data-unrepresented="value" ')],
] as const)('refuses a PlantUML carrier with %s instead of flattening it', async (_name, change) => {
  const fixture = data.fixtures.find(item => item.name === 'plantuml')!;
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async () => ({ body: change(fixture.body) }) });
  services.push(service);
  await expect(service.setSerializedContent(fixture.source)).rejects.toThrow();
  expect(service.recovery?.markdown).toBe(fixture.source);
  expect(service.editor.getText()).not.toContain('javascript:');
});
