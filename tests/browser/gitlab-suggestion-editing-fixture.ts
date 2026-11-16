import { EditorView, undo } from 'fountainjs-editor';
import { GitLabContentEditor } from '../../integrations/gitlab/services/content_editor';
import type { GitLabSuggestionEditingSession } from '../../integrations/gitlab/services/code_suggestion_editing';
import captures from '../../integrations/gitlab/fixtures/suggestion-live-html.json';
import '../../src/styles.css';
const fixture = captures.fixtures.find(item => item.name === 'single')!;
const original = 'first\noriginal A\noriginal B\nlast\n';
const host = { canSuggest: true, lines: ['original A', 'original B'], lineRange: { start: 2, end: 3 }, lineType: 'new', blobRawPath: '/fixture/raw/file.js' };
const bridge = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async source => {
  if (source !== fixture.source) throw new Error('No captured renderer response for this source.');
  return { body: fixture.body };
}, getSuggestionContext: () => host, loadSuggestionSource: async () => original });
await bridge.setSerializedContent(fixture.source);
const view = new EditorView(document.querySelector<HTMLElement>('#editor')!, bridge.editor, { ariaLabel: 'Suggestion editor' });
const status = document.querySelector('#status')!, panel = document.querySelector<HTMLElement>('#panel')!;
const input = (id: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
let session: GitLabSuggestionEditingSession | undefined;
const command = (id: string, run: () => void | Promise<void>) => document.querySelector('#' + id)!.addEventListener('click', async () => {
  try { await run(); } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
});
command('insert', () => { bridge.suggestions.insert(); status.textContent = 'Suggestion inserted'; });
command('edit', () => {
  session = bridge.suggestions.begin(); input('replacement').value = session.initial.text;
  panel.hidden = false; status.textContent = 'Editing captured suggestion';
});
command('load', async () => { const lines = await session!.prepareRange(); document.querySelector('#original')!.textContent = lines.map((line, index) => `${index + 1}: ${line}`).join('\n'); status.textContent = 'File lines loaded'; });
command('apply-source', () => { session!.applySource(input('replacement').value); panel.hidden = true; status.textContent = 'Replacement updated'; });
command('apply-range', async () => { await session!.applyRange(Number(input('start').value), Number(input('end').value)); panel.hidden = true; status.textContent = 'Range updated'; });
command('cancel', () => { session?.close(); panel.hidden = true; status.textContent = 'Cancelled'; });
command('undo', () => { undo(bridge.editor); status.textContent = 'Undone'; });
command('revoke', () => { host.canSuggest = false; status.textContent = 'Suggestion permission revoked'; });
command('export', () => { input('source').value = bridge.getSerializedContent(); });
window.addEventListener('pagehide', () => { view.destroy(); bridge.dispose(); });
status.textContent = 'Ready';
