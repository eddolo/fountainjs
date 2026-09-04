import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const script = join(process.cwd(), 'scripts/create-extension.mjs');

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'fountain-extension-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('extension scaffold command', () => {
  it('creates a complete extension without framework dependencies', () => {
    const parent = temporaryDirectory();
    const target = join(parent, 'fountain-callout');
    execFileSync(process.execPath, [script, 'create-extension', target, '--name', 'callout'], { stdio: 'pipe' });

    const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    const source = readFileSync(join(target, 'src/index.ts'), 'utf8');
    const test = readFileSync(join(target, 'test/extension.test.ts'), 'utf8');
    expect(manifest.peerDependencies['fountainjs-editor']).toBe('^0.3.0');
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.exports['.']).toEqual({ types: './dist/index.d.ts', import: './dist/index.js' });
    expect(manifest.scripts.doctor).toContain('fountain.extensions.mjs');
    expect(manifest.scripts.check).not.toContain('npm ');
    expect(source).toContain("name: 'callout'");
    expect(source).not.toContain('react');
    expect(test).toContain('assertExtensionConformance');
    expect(readFileSync(join(target, 'fountain.extensions.mjs'), 'utf8')).toContain('CalloutExtension');
  });

  it('refuses to overwrite a non-empty target and supports side-effect-free previews', () => {
    const parent = temporaryDirectory();
    const occupied = join(parent, 'occupied');
    execFileSync(process.execPath, [script, occupied], { stdio: 'pipe' });
    writeFileSync(join(occupied, 'keep.txt'), 'keep');
    const refused = spawnSync(process.execPath, [script, occupied], { encoding: 'utf8' });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('Refusing to overwrite');
    expect(readFileSync(join(occupied, 'keep.txt'), 'utf8')).toBe('keep');

    const preview = join(parent, 'preview-only');
    const output = execFileSync(process.execPath, [script, preview, '--dry-run'], { encoding: 'utf8' });
    expect(output).toContain('Would create');
    expect(() => readFileSync(join(preview, 'package.json'))).toThrow();
  });
});
