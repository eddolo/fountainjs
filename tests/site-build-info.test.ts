import { describe, expect, it } from 'vitest';
import { readPublishedSiteVersion, siteBuildBanner, type SiteBuildInfo } from '../tools/site-build-info';

const info: SiteBuildInfo = { packageVersion: '0.5.0-beta.1', sourceCommit: 'a'.repeat(40), modified: false,
  channel: 'development-preview', publishedVersion: '0.4.0-beta.2', registryCheckedAt: '2026-11-11T00:00:00.000Z', githubSource: false };

describe('website release identity', () => {
  it('keeps preview identity even when its package version matches npm', () => {
    const html = siteBuildBanner({ ...info, publishedVersion: info.packageVersion });
    expect(html).toContain('Development preview');
    expect(html).toContain('Examples use this source build.');
    expect(html).not.toContain('Released build');
  });
  it('distinguishes local working trees from linkable hosted source commits', () => {
    expect(siteBuildBanner({ ...info, channel: 'local-development' })).toContain('live working tree');
    expect(siteBuildBanner(info)).not.toContain('github.com');
    expect(siteBuildBanner({ ...info, githubSource: true })).toContain(`/commit/${info.sourceCommit}`);
    expect(siteBuildBanner({ ...info, modified: true })).toContain('with local changes');
  });
  it('does not invent registry or source evidence when verification is unavailable', () => {
    const html = siteBuildBanner({ ...info, publishedVersion: null, sourceCommit: null });
    expect(html).toContain('Check published npm version');
    expect(html).toContain('unavailable');
    expect(html).not.toContain('npm 0.5.0');
  });
  it('escapes label data and refuses to link invalid commit strings', () => {
    const html = siteBuildBanner({ ...info, sourceCommit: '<script>alert(1)</script>', packageVersion: '<img src=x>', githubSource: true });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('/commit/');
  });
  it('accepts only the named package and a valid registry version; failed lookups remain unknown', async () => {
    for (const body of [{ name: 'other-package', version: '9.0.0' }, { name: 'fountainjs-editor', version: '<script>' }, { name: 'fountainjs-editor', version: '0.5.0-foo..bar' }]) {
      expect(await readPublishedSiteVersion(async () => new Response(JSON.stringify(body)))).toBeNull();
    }
    expect(await readPublishedSiteVersion(async () => { throw new Error('offline'); })).toBeNull();
    expect(await readPublishedSiteVersion(async () => new Response(JSON.stringify({ name: 'fountainjs-editor', version: '0.4.0-beta.2' })))).toBe('0.4.0-beta.2');
  });
});
