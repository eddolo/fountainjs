import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const json = async path => JSON.parse(await read(path));
const digest = async path => ({ path, sha256: createHash('sha256').update(await readFile(new URL(path, root))).digest('hex') });
const local = async path => ({ ...await digest(path), retainedLocally: true });
const unit = await read('artifacts/suggestion-node-unit-20261116.log');
const counts = unit.match(/Test Files\s+(\d+) passed[^\n]*\n\s*Tests\s+(\d+) passed/); assert.ok(counts);
const browser = await read('artifacts/suggestion-node-desktop-accepted-20261116.log'); assert.ok(browser.includes('6 passed'));
const projects = [];
for (const name of ['chromium', 'firefox']) for (const kind of ['range', 'quoted', 'nested-list']) {
  const dir = `artifacts/suggestion-node-desktop-20261116/${name}/${kind}/`;
  const observed = await json(dir + 'observations.json'); assert.deepEqual(observed.errors, []);
  assert.equal(observed.savedJSONReopened, true);
  projects.push({ browser: name, container: kind, observations: observed,
    artifacts: await Promise.all(['editor.png', 'source.json', 'external.txt', 'observations.json'].map(file => digest(dir + file))),
    rawMarkdown: await local(dir + 'source.md'),
    localRecordings: await Promise.all(['video.webm', 'video-1.webm', ...(kind === 'range' ? ['frames.png'] : [])].map(file => local(dir + file))),
  });
}
const sourceFiles = [...new Set([
  ...execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/),
])].filter(path => /^(src\/|tests\/|integrations\/|scripts\/|playwright.config.ts$|api-surface.json$)/.test(path));
const report = {
  status: 'verified-node-foundation-not-inline-review-acceptance', date: new Date().toISOString(),
  parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Editable GitLab suggestion nodes from actual pinned preview captures, canonical Markdown block serializer hook, JSON persistence projection and specialized code input. Active host suggestion insertion/application remains guarded.',
  fixes: [
    'Suggestions have explicit params/fence metadata and plain code content; source newlines distinguish empty from blank-only replacements.',
    'The native Markdown writer indents host-produced block syntax inside quotes/lists. Undefined serializers retain standard loss reporting; conversion refusals propagate.',
    'Explicit code content roots prevent custom HTML import from flattening suggestion nodes or stripping leading LF.',
    'Specialized code-region focus and nested Tab input target the code rather than a stale prose selection.',
    'Opt-in JSON export omits only a proven still-empty automatic caret before saving. Default JSON and authored/copied/reopened blank paragraphs remain intact.',
  ],
  verification: {
    unit: { files: Number(counts[1]), tests: Number(counts[2]), workers: 2, ...await local('artifacts/suggestion-node-unit-20261116.log') },
    browser: { cases: 6, workers: 1, scope: 'Real Fountain browser editing with actual GitLab preview fixtures; local JSON save/reopen, not GitLab service persistence.', projects,
      ...await local('artifacts/suggestion-node-desktop-accepted-20261116.log') },
    gates: await Promise.all(['types-final', 'test-api', 'test-package', 'test-budget', 'test-server-runtimes', 'test-headless', 'test-markdown-conformance', 'test-performance'].map(name => local(`artifacts/suggestion-node-${name}-20261116.log`))),
    api: { declarations: 452, additions: ['MarkdownExportOptions.blockSerializers', 'JSONExportOptions.omitTrailingCaret; optional third JSON export argument'], changedDeclarationPairs: ['MarkdownExporter', 'JSONExporter'] },
    previousRealGitLabRuntime: 'artifacts/task-states-integration-20261116.json',
    nativeRuntimeRebuiltOrInstalled: false,
  },
  sourceDigestFormat: 'Working-tree bytes; Git may normalize text line endings.', source: await Promise.all(sourceFiles.map(digest)),
  witnesses: await Promise.all(['artifacts/suggestion-node-focused-20261116.log', 'artifacts/suggestion-node-desktop-final-20261116.log'].map(local)),
  visualReview: 'Final Chromium/Firefox range screenshots, Firefox nested-list screenshot and sampled range recording frames inspected. All six final screenshots retained. Initial loading frames are present; this is not continuous full-video review.',
  remaining: [
    'Active host suggestion context, insertion and range controls, stale-target/permission checks.',
    'Actual MR inline posting, editing, repository application and review batching; build/install/frontend/upstream/restart acceptance for this candidate.',
    'Broader mobile/IME/selection, published MR diff-widget adapters, and full GitLab product acceptance.',
    'Generic third-state ingestion, native DOCX checkbox retention and remaining programme roadmap.',
  ],
  publication: 'none', limits: 'unchanged', packageVersion: '0.5.0-beta.1',
};
await writeFile(new URL('artifacts/suggestion-node-integration-20261116.json', root), JSON.stringify(report, null, 2) + '\n');
const summary = `Current suggestion-node checkpoint (2026-11-16): source and range metadata now
live in editable typed nodes. JSON/HTML clipboard and canonical Markdown retain
empty/blank-only replacements and nested quote/list structure. A host-owned block
serializer hook reuses the native container writer. Physical tests exposed and
fixed custom-code HTML flattening, leading-LF loss, stale code-region focus and
an automatic caret becoming an authored blank after raw JSON persistence. JSON
export now has an explicit option to omit only that proven view repair.

All ${counts[2]} unit cases / ${counts[1]} files pass. Six recorded Chromium/Firefox
journeys use native typing, Enter/Tab, external-text and same-editor clipboard,
and local JSON save/reopen. Types, API/package, Node/Worker/headless, existing
size/performance limits and the Markdown conformance gate pass. Screenshots and
sampled frames were inspected. [Suggestion-node evidence](LINK).

Active inline suggestion context remains guarded. Insertion/range controls,
actual MR posting/applying and batching, and this candidate's native runtime/
frontend/upstream/restart acceptance remain open. The last installed GitLab
runtime is still the separately verified task-state checkpoint. No publication,
version increase or overall parity-row promotion.

`;
for (const name of ['integrations/gitlab/README.md', 'docs/ROADMAP.md', 'docs/TIPTAP_PARITY.md', 'docs/RELEASES.md']) {
  let content = await read(name);
  const start = content.indexOf('Current work (2026-11-16):');
  if (start >= 0) content = content.slice(0, start) + content.slice(content.indexOf('Latest GitLab task-state checkpoint', start));
  if (content.includes('Current suggestion-node checkpoint (2026-11-16):')) continue;
  assert.ok(content.includes('Latest GitLab task-state checkpoint (2026-11-16):'));
  const link = (name.startsWith('integrations/') ? '../../' : '../') + 'artifacts/suggestion-node-integration-20261116.json';
  content = content.replace('Latest GitLab task-state checkpoint (2026-11-16):', summary.replace('LINK', link) + 'Previous GitLab task-state checkpoint (2026-11-16):');
  await writeFile(new URL(name, root), content);
}
console.log(JSON.stringify({ tests: counts[2], files: counts[1], browserCases: 6 }));
