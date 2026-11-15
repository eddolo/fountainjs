import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { readGitLabAuditCredential } from './gitlab-audit-credentials.mjs';

if (process.platform !== 'linux') throw new Error('Run beside the isolated Linux GitLab deployment.');
const root = new URL('../', import.meta.url), base = 'http://127.0.0.1:5080';
const media = process.argv.includes('--media');
const diagrams = process.argv.includes('--diagrams');
const frontmatter = process.argv.includes('--frontmatter');
const quickActions = process.argv.includes('--quick-actions');
const quickActionCommands = process.argv.includes('--quick-action-commands');
const autocomplete = process.argv.includes('--autocomplete');
const footnoteProbe = process.argv.includes('--footnote-probe');
const footnotes = process.argv.includes('--footnotes') || footnoteProbe;
const catalogue = quickActionCommands || autocomplete;
const referenceContexts = process.argv.includes('--reference-context');
const references = process.argv.includes('--references') || referenceContexts;
if ([media, diagrams, references, frontmatter, quickActions, quickActionCommands, autocomplete, footnotes].filter(Boolean).length > 1) throw new Error('Choose one fixture profile.');
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const composeFile = fileURLToPath(new URL('integrations/gitlab/runtime/compose.yaml', root));
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
const container = docker('compose', '-f', composeFile, 'ps', '--all', '--quiet', 'baseline').trim();
const config = JSON.parse(docker('inspect', container))[0].Config;
if (config.Image !== pin.image || config.Labels['com.docker.compose.project'] !== 'fountain-gitlab-integration') throw new Error('Wrong deployment');
const password = readGitLabAuditCredential(args => docker('exec', '-i', container, ...args))?.password;
if (!password) throw new Error('Generated task password unavailable');
const browser = await chromium.launch(), context = await browser.newContext();
let restorePlantuml;
try {
  const page = await context.newPage();
  await expect(async () => {
    expect(JSON.parse(docker('inspect', '--format', '{{json .State}}', container)).Health?.Status).toBe('healthy');
    expect((await page.request.get(base + '/users/sign_in', { timeout: 5000 })).status()).toBe(200);
  }).toPass({ timeout: 180000, intervals: [1000, 2000, 5000] });
  await page.goto(base + '/users/sign_in');
  await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('sign_in'));
  const headers = { 'X-CSRF-Token': await page.locator('meta[name="csrf-token"]').getAttribute('content') };
  const request = async (path, data, method = 'POST') => {
    const response = await page.request.fetch(new URL(path, base).href, { headers, ...(data ? { method, data } : {}) });
    if (!response.ok()) throw new Error(`Task request failed: ${response.status()}`);
    return response.json();
  };
  const version = await request('/api/v4/version');
  expect(version.version).toBe(pin.version); expect(version.revision).toBe(pin.packagedRevision);
  if (diagrams) {
    await expect(async () => expect((await page.request.get('http://127.0.0.1:5081/')).ok()).toBe(true)).toPass();
    const settings = await request('/api/v4/application/settings');
    const prior = { plantuml_enabled: settings.plantuml_enabled, plantuml_url: settings.plantuml_url };
    restorePlantuml = async () => {
      const restored = await request('/api/v4/application/settings', prior, 'PUT');
      expect(restored.plantuml_enabled).toBe(prior.plantuml_enabled); expect(restored.plantuml_url).toBe(prior.plantuml_url);
    };
    const configured = await request('/api/v4/application/settings', { plantuml_enabled: true, plantuml_url: 'http://127.0.0.1:5081/' }, 'PUT');
    expect(configured.plantuml_enabled).toBe(true); expect(configured.plantuml_url).toBe('http://127.0.0.1:5081/');
  }
  const project = await request('/api/v4/projects/root%2Ffountain-product-integration');
  expect(project.visibility).toBe('private');
  const prior = catalogue ? JSON.parse(await readFile(new URL(autocomplete ? 'artifacts/gitlab-native-quick-action-controls-20261114/report.json' : 'artifacts/gitlab-native-quick-actions-20261114/report.json', root))) : null;
  const paths = await request('/api/graphql', { query: catalogue
    ? 'query($path:ID!,$iid:String){namespace(fullPath:$path){markdownPaths{markdownPreviewPath(iid:$iid) autocompleteSourcesPath(iid:$iid)}}}'
    : 'query($path:ID!){namespace(fullPath:$path){markdownPaths{markdownPreviewPath}}}',
    variables: { path: project.path_with_namespace, ...(catalogue ? { iid: String(prior.issue.iid) } : {}) } });
  if (paths.errors?.length) throw new Error('No actual renderer path');
  if (quickActionCommands) {
    const endpoint = new URL(paths.data.namespace.markdownPaths.autocompleteSourcesPath.commands, base);
    if (endpoint.origin !== base || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Nonlocal command source');
    const commands = await request(endpoint.href);
    if (!Array.isArray(commands)) throw new Error('Expected actual command records');
    await writeFile(new URL('integrations/gitlab/fixtures/quick-action-commands-live.json', root), JSON.stringify({
      scope: 'Authenticated available command records for the task issue; not a browser acceptance claim',
      upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision },
      issueIID: prior.issue.iid, endpoint: endpoint.pathname + endpoint.search, commands,
    }, null, 2) + '\n');
    console.log(JSON.stringify({ captured: commands.length, kind: 'quick-action-commands' }));
  }
  if (autocomplete) {
    const title = 'Fountain native completion milestone';
    const milestones = await request(`/api/v4/projects/${project.id}/milestones?search=Fountain%20native%20completion`);
    if (!milestones.some(item => item.title === title)) await request(`/api/v4/projects/${project.id}/milestones`, { title });
    const sources = paths.data.namespace.markdownPaths.autocompleteSourcesPath;
    const results = {};
    for (const [kind, source] of Object.entries(sources)) {
      if (typeof source !== 'string' || !source || kind === 'commands') continue;
      const endpoint = new URL(source, base);
      if (endpoint.origin !== base || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Nonlocal autocomplete source');
      if (kind === 'members') endpoint.searchParams.set('search', 'root');
      if (kind === 'issues') endpoint.searchParams.set('search', 'Fountain reference');
      const response = await page.request.get(endpoint.href, { headers });
      results[kind] = { endpoint: endpoint.pathname + endpoint.search, status: response.status(),
        data: response.ok() ? await response.json() : null };
    }
    const { parseGitLabAutocompleteItems, parseGitLabQuickActionCommands } = await import(new URL('artifacts/gitlab-native-runtime/fountain-runtime.mjs', root));
    const preview = new URL(paths.data.namespace.markdownPaths.markdownPreviewPath, base);
    if (preview.origin !== base) throw new Error('Nonlocal autocomplete preview');
    preview.searchParams.set('no_header_anchors', 'true');
    const projections = [];
    for (const [kind, key] of [['user', 'members'], ['issue', 'issues'], ['merge_request', 'mergeRequests'], ['label', 'labels'], ['milestone', 'milestones']]) {
      if (results[key]?.status !== 200) continue;
      for (const item of parseGitLabAutocompleteItems(kind, results[key].data).slice(0, 3)) {
        const rendered = await request(preview.href, { text: item.source });
        projections.push({ kind, source: item.source, body: rendered.body });
      }
    }
    const commandURL = new URL(sources.commands, base);
    if (commandURL.origin !== base || commandURL.username || commandURL.password || commandURL.hash) throw new Error('Nonlocal commands');
    const commands = parseGitLabQuickActionCommands(await request(commandURL.href));
    const issue = await request(`/api/v4/projects/${project.id}/issues/${prior.issue.iid}`);
    await writeFile(new URL('integrations/gitlab/fixtures/autocomplete-live.json', root), JSON.stringify({
      scope: 'Authenticated native autocomplete endpoints and actual records in the isolated private project; not a role/context/browser acceptance matrix',
      upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision },
      project: { id: project.id, fullPath: project.path_with_namespace },
      issue: { id: issue.id, iid: issue.iid, labels: issue.labels, assignees: issue.assignees }, sources, results, projections, commands,
    }, null, 2) + '\n');
    console.log(JSON.stringify({ kind: 'autocomplete', captured: Object.fromEntries(Object.entries(results)
      .map(([kind, result]) => [kind, { status: result.status, count: Array.isArray(result.data) ? result.data.length : null }])) }));
  }
  if (!catalogue) {
  const preview = new URL(paths.data.namespace.markdownPaths.markdownPreviewPath, base);
  if (preview.origin !== base) throw new Error('Nonlocal preview');
  preview.searchParams.set('no_header_anchors', 'true');
  if (quickActions) preview.searchParams.set('render_quick_actions', 'true');
  let quickActionOracle;
  if (quickActions) {
    // Run only the pure named transform from the pinned, trusted source. The
    // default ProseMirror/DOM deserializer is never called or bundled here.
    const installed = JSON.parse(await readFile(new URL('artifacts/gitlab-native-browser-install/install.json', root)));
    const path = 'app/assets/javascripts/content_editor/services/gl_api_markdown_deserializer.js';
    const original = execFileSync('git', ['-C', installed.source, 'show', `${pin.commit}:${path}`], { encoding: 'utf8' });
    const module = await import(`data:text/javascript;base64,${Buffer.from(original.replace(/^import [^\n]*;\r?$/gmu, '')).toString('base64')}`);
    quickActionOracle = { transform: module.transformQuickActions, path, sha256: createHash('sha256').update(original).digest('hex') };
  }
  let referenceRecords;
  if (references) {
    const title = 'Fountain reference controls fixture: & <review>';
    const issues = await request(`/api/v4/projects/${project.id}/issues?search=Fountain%20reference%20controls%20fixture&in=title`);
    const issue = issues.find(item => item.title === title) ?? await request(`/api/v4/projects/${project.id}/issues`, {
      title, description: 'Real issue used to verify native reference ID, title and summary controls.',
    });
    const branch = 'fountain-reference-controls';
    const requests = await request(`/api/v4/projects/${project.id}/merge_requests?state=all&source_branch=${branch}`);
    let mergeRequest = requests.find(item => item.title === title);
    if (!mergeRequest) {
      const branches = await request(`/api/v4/projects/${project.id}/repository/branches?search=${branch}`);
      if (!branches.some(item => item.name === branch)) await request(`/api/v4/projects/${project.id}/repository/commits`, {
        branch, start_branch: project.default_branch, commit_message: 'Add real reference-control fixture',
        actions: [{ action: 'create', file_path: '.fountain/reference-controls.md', content: 'Native Fountain reference-control acceptance fixture.\n' }],
      });
      mergeRequest = await request(`/api/v4/projects/${project.id}/merge_requests`, {
        source_branch: branch, target_branch: project.default_branch, title,
        description: 'Real merge request for native editor reference formatting acceptance.',
      });
    }
    const labels = await request(`/api/v4/projects/${project.id}/labels?search=Fountain%20reference`);
    const label = labels.find(item => item.name === 'Fountain reference & review') ?? await request(`/api/v4/projects/${project.id}/labels`, {
      name: 'Fountain reference & review', color: '#6699cc',
    });
    referenceRecords = { projectId: project.id, projectPath: project.path_with_namespace,
      issueIID: issue.iid, mergeRequestIID: mergeRequest.iid, label: label.name };
  }
  const issueToken = referenceRecords ? `#${referenceRecords.issueIID}` : '';
  const mrToken = referenceRecords ? `!${referenceRecords.mergeRequestIID}` : '';
  const labelToken = referenceRecords ? `~"${referenceRecords.label}"` : '';
  const inputs = footnotes ? [
    ['simple', 'A note[^alpha].\n\n[^alpha]: Definition **bold**.'],
    ['repeated', 'First[^alpha] and again[^alpha].\n\n[^alpha]: Shared definition.'],
    ['ordered', 'Second[^b], first[^a].\n\n[^a]: Alpha.\n\n[^b]: Beta.'],
    ['hyphen', 'A note[^a-b].\n\n[^a-b]: Hyphen label.'],
    ['underscore', 'A note[^a_b].\n\n[^a_b]: Underscore label.'],
    ['case', 'A note[^Alpha] and[^alpha].\n\n[^Alpha]: Capitalized label.'],
    ['space', 'A note[^two words].\n\n[^two words]: Spaced label.'],
    ['unicode', 'A note[^épreuve].\n\n[^épreuve]: Unicode label.'],
    ['unicode-space', 'A note[^non\u00a0breaking].\n\n[^non\u00a0breaking]: Non-breaking-space label.'],
    ['header-example', '---\nexample: |\n  [^hidden]: Metadata example.\n---\n\nProse.'],
    ['punctuation', 'A note[^a.b:c%41].\n\n[^a.b:c%41]: Punctuation label.'],
    ['multiblock', 'A note[^long].\n\n[^long]: First paragraph.\n\n    Second **paragraph**.\n\n    - One\n    - Two'],
    ['nested-reference', '> Quote[^q].\n\n- Item[^l].\n\n[^q]: Quote note.\n\n[^l]: List note.'],
    ['nested-definition', '> Body[^q].\n>\n> [^q]: A quoted definition.'],
    ['code', 'Literal `[^alpha]`.\n\n```text\n[^alpha]: Code only.\n```'],
    ['escaped', 'Literal \\[^alpha].\n\n[^alpha]: Unreferenced definition.'],
    ['unreferenced', 'Visible body.\n\n[^unused]: Retain unused source.'],
    ['missing', 'Unresolved[^missing].'],
    ['duplicate', 'A note[^a].\n\n[^a]: First.\n\n[^a]: Second.'],
    ['links-math', 'A note[^a].\n\n[^a]: [Link](https://example.com) and $`x^2`$.'],
    ['definition-reference', 'A note[^a].\n\n[^a]: With another[^b].\n\n[^b]: Second note.'],
    ['table', '| Heading |\n| --- |\n| Cell[^a] |\n\n[^a]: Table note.'],
    ['raw-html', '<sup class="footnote-ref"><a id="fnref-fake-1" href="#fn-fake-1">1</a></sup>'],
  ] : quickActions ? [
    ['close', '/close'], ['close-newline', '/close\n'],
    ['reopen', '/reopen'], ['confidential', '/confidential'],
    ['title', '/title Revised title'], ['due', '/due 2026-12-01'],
    ['assign', '/assign @root'], ['label', '/label ~"Fountain reference & review"'],
    ['unknown', '/not_a_real_action value'], ['slash', '/'],
    ['paragraph-lines', 'Before\n/close\nAfter'],
    ['multiple', '/close\n/assign @root\n\nAfter.'],
    ['reference-definition', 'Link to [help][ref]\n/close\n[ref]: https://example.com'],
    ['code', '```sh\n/close\n/usr/bin/env bash\n```'],
    ['tilde-code', '~~~sh\n/close\n~~~'],
    ['long-fence', '````\n```\n/close\n````'],
    ['quote', '> /close'], ['list', '- /close'], ['indented', '    /close'],
    ['marked', '**/close**'], ['inline-code', '`/close`'],
    ['crlf', 'Before\r\n/close\r\nAfter'],
    ['unicode', '/title 研究 & review <now>'],
    ['escaped', '\\/close'], ['entity', '&#47;close'], ['html', '<p>/close</p>'],
    ['html-container', '<div>\n/close\n</div>'],
    ['inline-leading', '*prefix* /close'], ['two-commands-paragraph', '/close\n/reopen'],
    ['after-command-alert', '/close\n> [!note] Note\n>\n> Explicit title.'],
    ['after-command-frontmatter', '/close\n```yaml frontmatter\ntitle: Paper\n```'],
    ['after-command-audio', '/close\n![Audio description](/uploads/media-fixture/recording.wav "Retained audio title")'],
  ] : frontmatter ? [
    ['yaml', '---\ntitle: Paper\n# Retain comment\ntags:\n  - research\n---\n\nBody **text**.'],
    ['toml', '+++\ntitle = "Paper"\n# Retain comment\ntags = ["research"]\n+++\n\nBody **text**.'],
    ['json', ';;;\n{ "title": "Paper", "tags": ["research"] }\n;;;\n\nBody **text**.'],
    ['yaml-empty', '---\n---\n\nBody.'], ['toml-empty', '+++\n+++\n\nBody.'], ['json-empty', ';;;\n;;;\n\nBody.'],
    ['yaml-only', '---\ntitle: Paper\n---'], ['yaml-crlf', '---\r\ntitle: Paper\r\n---\r\n\r\nBody.'],
    ['yaml-close-dots', '---\ntitle: Paper\n...\n\nBody.'], ['yaml-bom', '\uFEFF---\ntitle: Paper\n---\n\nBody.'],
    ['yaml-invalid', '---\ntitle: [unfinished\n---\n\nBody.'],
    ['nested', '> ---\n> title: Paper\n> ---\n\nBody.'],
    ['after-prose', 'Body.\n\n---\ntitle: Paper\n---'],
    ['fenced-param', '```yaml frontmatter\ntitle: Paper\n```\n\nBody.'],
    ['fenced-param-nested', '> ```yaml frontmatter\n> title: Paper\n> ```'],
    ['yaml-literal', '---\ntext: |\n  ---\n  <tag> & literal\n---\n\nBody.'],
    ['encoding', '# -*- coding: utf-8 -*-\n---\ntitle: Paper\n---\n\nBody.'],
    ['blank-prefix', '\n\n  \n---\ntitle: Paper\n---\n\nBody.'],
    ['explicit-language', '---toml\ntitle = "Paper"\n---\n\nBody.'],
    ['different-close', '---\ntitle: Paper\n+++\n\nBody.'],
    ['unknown-language', '---custom\nliteral\n---\n\nBody.'],
    ['yaml-cr', '---\rtitle: Paper\r---\r\rBody.'],
    ['fenced-colon', '```yaml:frontmatter\ntitle: Paper\n```\n\nBody.'],
    ['fenced-after-prose', 'Before.\n\n```yaml frontmatter\ntitle: Paper\n```'],
    ['two-fenced', '```yaml frontmatter\ntitle: First\n```\n\n```toml frontmatter\ntitle = "Second"\n```'],
    ['yaml-blank-content', '---\n\n---\n\nBody.'],
    ['yaml-trailing-blank', '---\ntitle: Paper\n\n---\n\nBody.'],
  ] : diagrams ? [
    ['mermaid', '```mermaid\ngraph LR\n  Draft-->Review\n```'],
    ['mermaid-unicode', '```mermaid\ngraph LR\n  A["研究 & review"]-->B["Ready <now>"]\n```'],
    ['mermaid-empty', '```mermaid\n```'],
    ['mermaid-invalid', '```mermaid\nnot a valid diagram\n```'],
    ['mermaid-nested', '> ```mermaid\n> graph LR\n>   A-->B\n> ```'],
    ['mermaid-list', '- Diagram\n\n  ```mermaid\n  graph LR\n    A-->B\n  ```'],
    ['mermaid-fence-params', '```mermaid unusual\ngraph LR\n A-->B\n```'],
    ['plantuml', '```plantuml\n@startuml\nAlice -> Bob: Review request\nBob --> Alice: Approved\n@enduml\n```'],
    ['plantuml-unicode', '```plantuml\n@startuml\nAlice -> Bob: 研究 & review\n@enduml\n```'],
    ['mixed', 'Before.\n\n```mermaid\ngraph LR\n  Draft-->Review\n```\n\nAfter.'],
  ] : referenceContexts ? [
    ['issue-alone', issueToken], ['issue-word-before', `prefix${issueToken}`], ['issue-word-after', `${issueToken}suffix`],
    ['issue-dash-before', `prefix-${issueToken}`], ['issue-slash-before', `prefix/${issueToken}`],
    ['issue-underscore-before', `prefix_${issueToken}`], ['issue-unicode-before', `語${issueToken}`],
    ['issue-parentheses', `(${issueToken})`], ['issue-punctuation', `See: ${issueToken}.`],
    ['issue-mark-before', `**prefix**${issueToken}`], ['issue-mark-after', `${issueToken}**suffix**`],
    ['issue-marked', `__${issueToken}__`], ['issue-link-label', `[${issueToken}](/help/user/project)`],
    ['issue-code', `\`${issueToken}\``], ['issue-escaped', `\\${issueToken}`],
    ['mr-word-before', `prefix${mrToken}`], ['mr-word-after', `${mrToken}suffix`],
    ['user-word-before', 'prefix@root'], ['user-word-after', '@rootsuffix'], ['user-marked', '**@root**'],
    ['label-word-before', `prefix${labelToken}`], ['label-word-after', `${labelToken}suffix`],
    ['label-marked', `**${labelToken}**`],
    ['issue-span-boundary', `prefix<span>${issueToken}</span>suffix`],
    ['user-span-boundary', 'prefix<span>@root</span>suffix'],
    ['label-span-boundary', `prefix<span>${labelToken}</span>suffix`],
    ['mr-span-boundary', `prefix<span>${mrToken}</span>suffix`],
    ['source-spelling', `Title\n=====\n\nKeep __bold__ and [guide][g].\n\nReference ${issueToken}.\n\nEdit here.\n\n[g]: /help/user/project 'Guide title'\n`],
    ['source-crlf', `Title\r\n=====\r\n\r\nKeep __bold__.\r\n\r\nReference ${issueToken}.\r\n\r\nEdit here.\r\n`],
    ['source-soft-break', `Keep first line\nsecond __line__.\n\nReference ${issueToken}.\n\nEdit here.\n`],
  ] : references ? [
    ...['', '+', '+s'].map(suffix => [`issue-${suffix || 'id'}`, `#${referenceRecords.issueIID}${suffix}`]),
    ...['', '+', '+s'].map(suffix => [`merge-request-${suffix || 'id'}`, `!${referenceRecords.mergeRequestIID}${suffix}`]),
    ['qualified-issue', `${project.path_with_namespace}#${referenceRecords.issueIID}`],
    ['qualified-issue-title', `${project.path_with_namespace}#${referenceRecords.issueIID}+`],
    ['user', '@root'], ['label', `~"${referenceRecords.label}"`],
    ['not-found', '#999999'], ['not-found-expanded', '#999999+s'],
    ['mixed', `Before #${referenceRecords.issueIID} after.`], ['code', `\`#${referenceRecords.issueIID}\``],
    ['issue-link', `[Issue](${project.web_url}/-/issues/${referenceRecords.issueIID})`],
  ] : media ? [
    ['image', '![Original figure](/uploads/media-fixture/figure.png "Figure title")'],
    ['image-sized', '![Sized figure](/uploads/media-fixture/figure.png){width="320" height="180"}'],
    ['image-percent', '![Responsive figure](/uploads/media-fixture/figure.png){width="50%"}'],
    ['image-inline', 'Before ![Inline figure](/uploads/media-fixture/figure.png) after.'],
    ['image-link', '[![Linked figure](/uploads/media-fixture/figure.png)](/help/user/project)'],
    ['image-link-sized', '[![Linked figure](/uploads/media-fixture/figure.png "Linked figure title"){width="240"}](/help/user/project)'],
    ['audio', '![Audio description](/uploads/media-fixture/recording.wav)'],
    ['audio-titled', '![Audio description](/uploads/media-fixture/recording.wav "Retained audio title")'],
    ['audio-sized', '![Audio description](/uploads/media-fixture/recording.wav "Retained audio title"){width="240" height="54"}'],
    ['audio-link', '[Audio download](/uploads/media-fixture/recording.wav)'],
    ['video', '![Video description](/uploads/media-fixture/recording.webm)'],
    ['video-titled', '![Video description](/uploads/media-fixture/recording.webm "Retained video title"){width="280"}'],
    ['multiple-titled', '![Video description](/uploads/media-fixture/recording.webm "Retained video title"){width="280"}\n\n![Audio description](/uploads/media-fixture/recording.wav "Retained audio title")'],
    ['video-sized', '![Sized video](/uploads/media-fixture/recording.webm){width="320" height="180"}'],
    ['video-inline', 'Before ![Inline video](/uploads/media-fixture/recording.webm) after.'],
    ['nested', '> ![Quoted video](/uploads/media-fixture/recording.webm)\n\n- ![Listed audio](/uploads/media-fixture/recording.wav)'],
    ['youtube', '![Training video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'],
    ['vimeo', '![Training video](https://vimeo.com/123456789)'],
    ['drawio', '![Architecture](/uploads/media-fixture/architecture.drawio.svg)'],
    ['raw-video', '<video src="/uploads/media-fixture/recording.webm" controls width="320" height="180"></video>'],
  ] : [
    ...['note', 'tip', 'important', 'warning', 'caution'].map(type => [`default-${type}`, `> [!${type}]\n>\n> Body **with marks**.`]),
    ['custom', '> [!warning] Deployment blocked\n>\n> Keep the rollback ready.'],
    ['custom-default-word', '> [!note] Note\n>\n> Explicit title.'],
    ['other-default-word', '> [!note] Tip\n>\n> Custom title.'],
    ['empty', '> [!tip]'],
    ['nested', '> [!note] Outer\n>\n> First.\n>\n> > [!warning] Inner\n> >\n> > Nested.'],
    ['list', '- > [!important] In a list\n  >\n  > Body.\n- Neighbor.'],
    ['code-math', '> [!note] Source\n>\n> Inline $x^2$.\n>\n> ```js\n> const x = 1;\n> ```'],
    ['formatted-title', '> [!note] **Important** & <tag>\n>\n> Body.'],
    ['unknown', '> [!unknown] Other\n>\n> Ordinary quote.'],
  ];
  if (footnoteProbe) inputs.push(
    ['emoji-prefix', '🧑‍🔬 é Before[^数学].\n\n[^数学]: Research.'],
    ['tab-prefix', '\tcode\n\nBefore\t[^tab].\n\n[^tab]: Definition.'],
    ['header-unused', '---\ntitle: Paper\n---\n\nBody.\n\n[^unused]: Unused **body**.'],
    ['unused-open-fence', 'Body.\n\n[^unused]: Retain **body**.\n\n```text\nOpen fence'],
    ['unused-nested', '> Body.\n>\n> [^unused]: Unused quote.'],
    ['unused-multiblock', 'Body.\n\n[^unused]: First **paragraph**.\n\n    Second paragraph.\n\n    - One\n    - Two'],
    ['escaped-closing-label', 'Body[^a\\]b].\n\n[^a\\]b]: Escaped bracket.'],
    ['escaped-opening-label', 'Body[^a\\[b].\n\n[^a\\[b]: Escaped bracket.'],
    ['entity-label', 'Body[^a&amp;b].\n\n[^a&amp;b]: Entity.'],
    ['backslash-label', 'Body[^a\\b].\n\n[^a\\b]: Backslash.'],
    ['unicode-case', 'Body[^STRASSE] and[^Straße].\n\n[^Straße]: Case folding.'],
    ['crlf-unicode', '🧑‍🔬 Before[^é].\r\n\r\n[^é]: Body.'],
    ['cr-unicode', '🧑‍🔬 Before[^é].\r\r[^é]: Body.'],
    ['code-candidate-and-unused', 'Literal `[^fake]: text`.\n\n[^real]: Real unused.'],
    ['comment-candidate-and-unused', '<!--\n[^fake]: Comment.\n-->\n\n[^real]: Real unused.'],
    ['two-unused', 'Body.\n\n[^b]: Beta.\n\n[^a]: Alpha.'],
    ['unused-math-link', 'Body.\n\n[^a]: [Link](https://example.com) and $`x^2`$.'],
    ['body-backref-lookalike', 'Body[^a].\n\n[^a]: [↩](#fnref-a) and <a href="#fnref-a" data-footnote-backref="">↩</a>.'],
    ['body-backref-code', 'Body[^a].\n\n[^a]: Code `data-footnote-backref` and `↩`.'],
    ['ascii-entity-label', 'Body[^a&#32;b].\n\n[^a&#32;b]: Entity space.'],
    ['decoded-bracket-entity', 'Body[^a&#91;b].\n\n[^a&#91;b]: Bracket entity.'],
    ['literal-code-and-spaced', '`[^fake]: example`\n\n[^two words]: ordinary prose.'],
    ['bom-unused', '\uFEFFBody.\n\n[^a]: Unused.'],
    ['tab-definition', 'Body.\n\n[^a]: First.\n\n\tSecond.'],
  );
  const probeHelpers = footnoteProbe ? await import(new URL('artifacts/gitlab-footnote-probe/source.mjs', root)) : undefined;
  const fixtures = [];
  for (const [name, source] of inputs) {
    const renderedSource = quickActionOracle ? quickActionOracle.transform(source) : source;
    const result = await request(preview.href, { text: renderedSource });
    if (typeof result.body !== 'string') throw new Error('Missing renderer body');
    const probe = probeHelpers?.prepareGitLabFootnoteProbe(source, probeHelpers.readGitLabFrontmatter(source)?.length ?? 0);
    const probeResult = probe ? await request(preview.href, { text: probe.source }) : undefined;
    if (probe && typeof probeResult?.body !== 'string') throw new Error('Missing footnote probe renderer body');
    fixtures.push({ name, source, body: result.body, ...(footnoteProbe ? { probe, probeBody: probeResult?.body } : {}), ...(quickActions ? { renderedSource, references: result.references,
      untransformed: await request(preview.href, { text: source }) } : {}) });
  }
  await writeFile(new URL(`integrations/gitlab/fixtures/${footnoteProbe ? 'footnote-probe' : footnotes ? 'footnote' : quickActions ? 'quick-actions' : frontmatter ? 'frontmatter' : diagrams ? 'diagram' : referenceContexts ? 'reference-context' : references ? 'reference' : media ? 'media' : 'alert'}-live-html.json`, root), JSON.stringify({
    scope: media ? 'Authenticated renderer structure fixtures; asset URLs are illustrative, not uploaded/playback acceptance' : 'Authenticated pinned GitLab renderer fixtures; not browser product acceptance',
    ...(quickActionOracle ? { quickActionOracle: { path: quickActionOracle.path, sha256: quickActionOracle.sha256 } } : {}),
    ...(references ? { referenceRecords } : {}),
    ...(diagrams ? { plantumlProvider: { url: 'http://127.0.0.1:5081/', image: 'plantuml/plantuml-server@sha256:3719f4a9b0b061f1aa42d14d130388f831954ca65685d521b6c5b72301e993e6' } } : {}),
    upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision }, fixtures,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ captured: fixtures.length, version: version.version, kind: footnotes ? 'footnotes' : quickActions ? 'quick-actions' : frontmatter ? 'frontmatter' : diagrams ? 'diagrams' : referenceContexts ? 'reference-context' : references ? 'references' : media ? 'media' : 'alerts' }));
  }
} catch (error) { console.error(String(error).replaceAll(password, '[redacted]')); process.exitCode = 1; }
finally { try { await restorePlantuml?.(); } finally { await context.close(); await browser.close(); } }
