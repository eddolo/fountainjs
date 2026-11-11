import { afterEach, expect, it, vi } from 'vitest';
import { GitLabAssetResolver, type GitLabAssetResolverOptions, type GitLabRenderResponse } from '../integrations/gitlab/services/asset_resolver';
import data from '../integrations/gitlab/fixtures/service-html.json';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
function setup(response: GitLabRenderResponse | (() => Promise<GitLabRenderResponse>) = {}, extra: Partial<GitLabAssetResolverOptions> = {}) {
  const render = vi.fn(async (_markdown: string, _options?: { signal: AbortSignal }) => typeof response === 'function' ? response() : response);
  const issues: unknown[] = [];
  const resolver = new GitLabAssetResolver({ renderMarkdown: render, describeLabels: (action, count) => `${action}:${count}`,
    onIssue: issue => issues.push(issue), ...extra });
  cleanup.push(() => resolver.dispose());
  return { resolver, render, issues };
}

it.each([
  ['issue', '#1', data.fixtures.RESOLVED_ISSUE_HTML, { text: '#1 (closed)', href: '/gitlab-org/gitlab/-/issues/1', expandedText: '500 error on MR approvers edit page (#1 - closed)', fullyExpandedText: '500 error on MR approvers edit page (#1 - closed) • Unassigned' }],
  ['merge request', '!1', data.fixtures.RESOLVED_MERGE_REQUEST_HTML, { text: '!1 (merged)', href: '/gitlab-org/gitlab/-/merge_requests/1', fullyExpandedText: 'Enhance the LDAP group synchronization (!1 - merged) • John Doe' }],
  ['epic', '&1', data.fixtures.RESOLVED_EPIC_HTML, { text: '&1', href: '/groups/gitlab-org/-/epics/1' }],
  ['label', '~Aquanix', data.fixtures.RESOLVED_LABEL_HTML, { text: 'Aquanix', href: '/gitlab-org/gitlab-shell/-/issues?label_name=Aquanix', backgroundColor: 'rgb(230, 84, 49)' }],
  ['snippet', '$25', data.fixtures.RESOLVED_SNIPPET_HTML, { text: '$25', href: '/gitlab-org/gitlab-shell/-/snippets/25' }],
  ['milestone', '%v4.0', data.fixtures.RESOLVED_MILESTONE_HTML, { text: '%v4.0', href: '/gitlab-org/gitlab-shell/-/milestones/5' }],
  ['user', '@root', data.fixtures.RESOLVED_USER_HTML, { text: '@root', href: '/root' }],
  ['vulnerability', '[vulnerability:1]', data.fixtures.RESOLVED_VULNERABILITY_HTML, { text: '[vulnerability:1]', href: '/gitlab-org/gitlab-shell/-/security/vulnerabilities/1' }],
] as const)('reads the pinned upstream %s reference without DOM or label loss', async (_kind, source, html, expected) => {
  const { resolver, render } = setup({ body: html });
  expect(await resolver.resolveReference(source)).toMatchObject(expected);
  expect(render.mock.calls[0]?.[0]).toBe(`${source} ${source}+ ${source}+s`);
  expect(typeof globalThis.document).toBe('undefined');
});

it.each(['', '+', '+s'])('resolves the original reference before the %s expansion suffix', async suffix => {
  const { resolver, render } = setup({ body: data.fixtures.RESOLVED_ISSUE_HTML });
  await resolver.resolveReference('#1' + suffix);
  expect(render.mock.calls[0]?.[0]).toBe('#1 #1+ #1+s');
});

it.each([
  ['wiki', 'test-file.png', data.fixtures.PROJECT_WIKI_ATTACHMENT_IMAGE_HTML, '/group1/project1/-/wikis/test-file.png'],
  ['repository', 'README.md', data.fixtures.REPOSITORY_RELATIVE_LINK_HTML, 'https://gitlab.com/gitlab-org/gitlab/-/blob/master/README.md'],
  ['upload', '/uploads/0123456789abcdef0123456789abcdef/x.png', data.fixtures.UPLOAD_IMAGE_HTML, 'https://gitlab.com/-/project/278964/uploads/0123456789abcdef0123456789abcdef/x.png'],
  ['asset proxy', 'https://example.com/a.png', data.fixtures.ASSET_PROXIED_IMAGE_HTML, 'https://user-content.gitlab-static.net/fda89c571ee4bb0bb2acf1b7e12b3039af6a5ffc/68747470733a2f2f6578616d706c652e636f6d2f612e706e67'],
])('resolves a %s display URL while keeping the canonical input unchanged', async (_kind, canonical, html, display) => {
  const { resolver, render } = setup({ body: html });
  expect(await resolver.resolveUrl(canonical)).toBe(display);
  expect(render.mock.calls[0]?.[0]).toBe(`[link](${canonical})`);
});

it('escapes authored delimiters and backslashes before asking the real host renderer', async () => {
  const { resolver, render } = setup();
  const canonical = 'test-file.png)[x](https://example.com/"x")';
  expect(await resolver.resolveUrl(canonical)).toBe(canonical);
  expect(render.mock.calls[0]?.[0]).toBe('[link](test-file.png\\)[x]\\(https://example.com/\\"x\\"\\))');
  await resolver.resolveUrl('path\\name(1).png');
  expect(render.mock.calls[1]?.[0]).toBe('[link](path\\\\name\\(1\\).png)');
});

it('reads iframe transformation data without creating or loading an iframe', async () => {
  const { resolver } = setup({ body: '<p><span class="js-render-iframe" data-iframe-src="https://www.youtube.com/embed/abc" data-iframe-provider-id="youtube"></span></p>' });
  expect(await resolver.resolveIframeSrc('https://www.youtube.com/watch?v=abc')).toEqual({ src: 'https://www.youtube.com/embed/abc', providerId: 'youtube' });
});

it('keeps unresolved embeds and absent anchors as safe canonical fallbacks', async () => {
  const { resolver } = setup({ body: '<p>Unresolved</p>' });
  expect(await resolver.resolveUrl('README.md')).toBe('README.md');
  expect(await resolver.resolveIframeSrc('https://example.com/video')).toEqual({ src: 'https://example.com/video', providerId: null });
});

it('resolves only the requested placeholder and preserves decoded Unicode text', async () => {
  const { resolver } = setup({ body: '<p><span data-placeholder="other">Wrong</span><span data-placeholder="%{project_name}">A &amp; B — 日本語</span></p>' });
  expect(await resolver.resolvePlaceholder('%{project_name}')).toEqual({ placeholder: '%{project_name}', value: 'A & B — 日本語' });
  expect(await resolver.resolvePlaceholder('%{missing}')).toBeNull();
});

it.each(['/label', '/unlabel', '/relabel'])('delegates %s label descriptions to the actual host localizer', async command => {
  const descriptions = vi.fn((action, count) => `${action}:${count}`);
  const { resolver } = setup({ references: { commands: '<span class="gl-label">Outside</span><p>Changes <span class="gl-label">One</span> <span class="gl-label">Two</span>.</p>' } }, { describeLabels: descriptions });
  expect(await resolver.explainQuickAction(command + ' ~one ~two')).toBe(command === '/label' ? 'add:2' : command === '/unlabel' ? 'remove:2' : 'replace:2');
  expect(descriptions.mock.calls[0]?.[1]).toBe(2);
});

it('reads plain quick-action explanations without returning executable HTML', async () => {
  const { resolver } = setup({ references: { commands: '<p>Closes <strong>the issue</strong>.</p>' } });
  expect(await resolver.explainQuickAction('/close')).toBe('Closes the issue.');
});

it('renders diagrams separately by language and fences source containing backticks', async () => {
  const { resolver, render } = setup({ body: '<img src="/fallback.svg" data-src="/diagram.svg">' });
  expect(await resolver.renderDiagram('graph TD\n````\n/close', 'mermaid')).toBe('/diagram.svg');
  expect(render.mock.calls[0]?.[0]).toBe('`````mermaid\ngraph TD\n````\n/close\n`````');
  await resolver.renderDiagram('graph TD', 'plantuml');
  expect(render.mock.calls[1]?.[0]).toBe('````plantuml\ngraph TD\n````');
  await expect(resolver.renderDiagram('graph TD', 'mermaid\n/close')).rejects.toThrow('language');
});

it('shares concurrent lookups and retries an actual rendering failure', async () => {
  let complete!: (value: GitLabRenderResponse) => void;
  const { resolver, render, issues } = setup(() => new Promise(resolve => { complete = resolve; }));
  const first = resolver.resolveUrl('README.md'), second = resolver.resolveUrl('README.md');
  await Promise.resolve();
  expect(render).toHaveBeenCalledTimes(1);
  complete({ body: '<a href="/project/README.md">link</a>' });
  expect(await Promise.all([first, second])).toEqual(['/project/README.md', '/project/README.md']);
  expect(issues).toEqual([]);
  const failing = setup(async () => { throw new Error('Host network error'); });
  expect(await failing.resolver.resolveUrl('README.md')).toBe('README.md');
  expect(await failing.resolver.resolveUrl('README.md')).toBe('README.md');
  expect(failing.render).toHaveBeenCalledTimes(2);
  expect(failing.issues).toHaveLength(2);
});

it('bounds cache by LRU entries and by the retained input/HTML byte count', async () => {
  const { resolver, render } = setup({ body: '<p>not resolved</p>' }, { maxCacheEntries: 2 });
  await resolver.resolveUrl('one'); await resolver.resolveUrl('two'); await resolver.resolveUrl('one');
  await resolver.resolveUrl('three'); await resolver.resolveUrl('two');
  expect(render.mock.calls.map(call => call[0])).toEqual(['[link](one)', '[link](two)', '[link](three)', '[link](two)']);
  const bounded = setup({ body: '<p>' + 'X'.repeat(100) + '</p>' }, { maxCacheBytes: 60 });
  await bounded.resolver.resolveUrl('one'); await bounded.resolver.resolveUrl('one');
  expect(bounded.render).toHaveBeenCalledTimes(2);
});

it('cancels evicted pending requests on dispose and settles callers whose provider ignores cancellation', async () => {
  const signals: AbortSignal[] = [];
  const { resolver } = setup({}, { maxCacheEntries: 1, renderMarkdown: async (_markdown, options) => {
    signals.push(options!.signal); return new Promise(() => {});
  } });
  const first = resolver.resolveUrl('one'), second = resolver.resolveUrl('two');
  await Promise.resolve();
  resolver.dispose();
  expect(signals).toHaveLength(2);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(await Promise.all([first, second])).toEqual(['one', 'two']);
  await expect(resolver.resolveUrl('later')).rejects.toThrow('disposed');
});

it.each(['javascript:alert(1)', '//evil.example/image', '/\\evil.example/image'])('refuses unsafe canonical input %s before calling the provider', async source => {
  const { resolver, render } = setup();
  await expect(resolver.resolveUrl(source)).rejects.toThrow('canonical');
  expect(render).not.toHaveBeenCalled();
});

it('refuses unsafe rendered links, embeds, diagrams and references while preserving original source', async () => {
  const { resolver, issues } = setup({ body: '<a href="javascript:alert(1)">Wrong</a><span class="js-render-iframe" data-iframe-src="javascript:alert(1)"></span><img data-src="javascript:alert(1)">' });
  expect(await resolver.resolveUrl('README.md')).toBe('README.md');
  expect(await resolver.resolveIframeSrc('https://example.com/video')).toEqual({ src: 'https://example.com/video', providerId: null });
  expect(await resolver.renderDiagram('graph TD', 'mermaid')).toBe('');
  expect(await resolver.resolveReference('#1')).toEqual({});
  expect(issues).toHaveLength(4);
});

it.each([
  { body: 12 }, { references: { commands: [] } }, null, [], { references: [] },
])('reports malformed rendering envelopes and does not cache them', async response => {
  const { resolver, render, issues } = setup(response as unknown as GitLabRenderResponse);
  expect(await resolver.resolveUrl('README.md')).toBe('README.md');
  expect(await resolver.resolveUrl('README.md')).toBe('README.md');
  expect(render).toHaveBeenCalledTimes(2);
  expect(issues).toHaveLength(2);
});

it('bounds UTF-8 response bytes and structural depth without executing source', async () => {
  const bytes = setup({ body: '日'.repeat(100) }, { maxHTMLBytes: 200 });
  expect(await bytes.resolver.resolveUrl('README.md')).toBe('README.md');
  expect(bytes.issues).toHaveLength(1);
  const depth = setup({ body: '<div>'.repeat(130) + '<a href="/too-deep">Link</a>' + '</div>'.repeat(130) });
  expect(await depth.resolver.resolveUrl('README.md')).toBe('README.md');
  expect(depth.issues).toHaveLength(1);
});
