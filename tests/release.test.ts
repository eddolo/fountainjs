import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release metadata gate', () => {
  it('keeps normal CI verification aligned with every local package gate', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    const verify = workflow.split(/^  verify:\s*$/m)[1]?.split(/^  [\w-]+:\s*$/m)[0];
    expect(verify, 'The normal CI verify job must exist').toBeTruthy();
    const commands = [...verify!.matchAll(/^      - run: (.+)$/gm)]
      .map(match => match[1].trim());
    const required = manifest.scripts.check.split(' && ') as string[];
    expect(required.length).toBeGreaterThan(0);
    const missing = commands.includes('pnpm check') ? [] : required.filter(command => !commands.includes(command));
    expect(missing, 'Normal CI must run pnpm check or every constituent gate').toEqual([]);
  });

  it('accepts the worktree package metadata outside a tagged release', () => {
    expect(execFileSync(process.execPath, ['scripts/check-release.mjs'], { encoding: 'utf8' }))
      .toContain('Release metadata verified');
  });

  it('enforces exact tag, versioned notes, and an empty Unreleased section', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fountain-release-'));
    const packagePath = join(directory, 'package.json');
    const changelogPath = join(directory, 'CHANGELOG.md');
    const run = (tag: string) => spawnSync(process.execPath, [
      'scripts/check-release.mjs', '--package', packagePath, '--changelog', changelogPath, '--tag', tag,
    ], { encoding: 'utf8' });
    try {
      writeFileSync(packagePath, JSON.stringify({ version: '1.2.3' }));
      writeFileSync(changelogPath, '# Changelog\n\n## Unreleased\n\n## 1.2.3 — Stable\n\n- Evidence.\n');
      expect(run('v1.2.3')).toMatchObject({ status: 0 });

      const wrongTag = run('v9.9.9');
      expect(wrongTag.status).toBe(1);
      expect(wrongTag.stderr).toContain('does not match package version');

      writeFileSync(changelogPath, '# Changelog\n\n## Unreleased\n\n- Pending.\n\n## 1.2.3 — Stable\n');
      const unreleased = run('v1.2.3');
      expect(unreleased.status).toBe(1);
      expect(unreleased.stderr).toContain('still contains unreleased entries');

      writeFileSync(changelogPath, '# Changelog\n\n## Unreleased\n');
      const missingNotes = run('v1.2.3');
      expect(missingNotes.status).toBe(1);
      expect(missingNotes.stderr).toContain('no release heading');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
