import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const repository = fileURLToPath(new URL('../', import.meta.url));
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const npm = 'https://www.npmjs.com/package/fountainjs-editor';
export interface SiteBuildInfo {
  packageVersion: string;
  sourceCommit: string | null;
  modified: boolean | null;
  channel: 'local-development' | 'development-preview';
  publishedVersion: string | null;
  registryCheckedAt: string | null;
  githubSource: boolean;
}

export async function readPublishedSiteVersion(request: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await request('https://registry.npmjs.org/fountainjs-editor/latest', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const data = await response.json();
    return data.name === 'fountainjs-editor' && typeof data.version === 'string' && versionPattern.test(data.version) ? data.version : null;
  } catch { return null; }
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function siteBuildBanner(info: SiteBuildInfo): string {
  const commit = info.sourceCommit?.slice(0, 12) ?? 'unavailable';
  const source = info.githubSource && info.sourceCommit && /^[a-f0-9]{40}$/.test(info.sourceCommit)
    ? `<a href="https://github.com/eddolo/fountainjs/commit/${info.sourceCommit}">${commit}</a>` : `<code>${escape(commit)}</code>`;
  const published = info.publishedVersion
    ? `<a href="${npm}/v/${encodeURIComponent(info.publishedVersion)}">npm ${escape(info.publishedVersion)}</a>`
    : `<a href="${npm}">Check published npm version</a>`;
  const channel = info.channel === 'local-development' ? 'Local development' : 'Development preview';
  const state = info.channel === 'local-development' ? ' · live working tree' : info.modified ? ' · with local changes' : info.modified === null ? ' · working-tree status unavailable' : '';
  return `<strong>${channel}</strong><span>package <code>${escape(info.packageVersion)}</code></span><span>source ${source}${state}</span><span>${published}</span><span>Examples use this source build.</span>`;
}

const styles = `.site-build-info{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.25rem 1rem;padding:.5rem 1rem;color:#322b47;background:#f1effa;border-bottom:1px solid #d8d2e6;font:12px/1.5 system-ui,sans-serif}.site-build-info>*{min-width:0;overflow-wrap:anywhere}.site-build-info a{text-decoration:underline;text-underline-offset:2px}.site-build-info code{font:inherit}.site-build-info a:focus-visible{outline:2px solid #5941bc;outline-offset:3px}@media print{.site-build-info{display:none!important}}`;

export function siteBuildInfoPlugin(publicPages: readonly string[]): Plugin {
  const pages = new Set(publicPages);
  let info: SiteBuildInfo;
  return {
    name: 'fountain-site-build-info',
    async configResolved(config) {
      const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
      if (!versionPattern.test(packageVersion)) throw new Error('The site requires a valid package version.');
      let sourceCommit: string | null = null, modified: boolean | null = null;
      try {
        sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        modified = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
      } catch { /* Source archives without Git must not claim a known revision. */ }
      // Registry access is build-time only. Dev startup and browser navigation
      // remain independent of it; unavailable verification stays explicit.
      const publishedVersion = config.command === 'build' ? await readPublishedSiteVersion() : null;
      info = { packageVersion, sourceCommit, modified, publishedVersion,
        channel: config.command === 'build' ? 'development-preview' : 'local-development',
        registryCheckedAt: publishedVersion ? new Date().toISOString() : null,
        githubSource: process.env.GITHUB_ACTIONS === 'true' };
    },
    transformIndexHtml(_html, context) {
      if (!pages.has(context.path)) return;
      return [
        { tag: 'style', attrs: { 'data-fountain-build-info': '' }, children: styles, injectTo: 'head' },
        { tag: 'aside', attrs: { class: 'site-build-info', 'aria-label': 'Website build information' }, children: siteBuildBanner(info), injectTo: 'body-prepend' },
      ];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(info, null, 2) + '\n' });
    },
  };
}
