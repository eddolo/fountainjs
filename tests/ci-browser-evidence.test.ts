import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('browser CI retry evidence retention', () => {
  it('uploads failed-attempt evidence even when the final job passes', () => {
    const upload = workflow.slice(workflow.lastIndexOf('- uses: actions/upload-artifact@v4'));
    expect(upload).toContain('if: always()');
    expect(upload).toContain('name: playwright-report');
    expect(upload).toContain('test-results/**/media-selection-events.json');
    expect(upload).not.toContain('if: failure()');
    for (const directory of ['test-results', 'structural-direction-preflight-results',
      'structural-direction-clipboard-results', 'native-focus-preflight-results',
      'firefox-selection-preflight-results']) {
      for (const file of ['trace.zip', 'test-failed-*.png', 'error-context.md']) {
        expect(upload).toContain(`${directory}/**/${file}`);
      }
    }
    const presence = workflow.slice(workflow.indexOf('- name: Compiled native presence and retained-document regressions'),
      workflow.indexOf('# Independent clipboard diagnosis'));
    expect(presence).toContain('run: pnpm exec playwright test --config artifacts/cursor-navigation-browser-20261106.config.ts');
    expect(presence).toContain('if: always()');
    expect(presence).toContain('artifacts/cursor-overlay-browser-final-20261106.json');
    expect(presence).toContain('artifacts/cursor-overlay-browser-final-20261106/**');
    expect(presence).not.toContain('continue-on-error: true');
    expect(presence).not.toContain('if: failure()');
  });

  it('keeps preflight outputs separate so later runs cannot remove their failed attempts', () => {
    const commands = workflow.split('\n').filter(line => line.includes('run:') && line.includes('playwright test'));
    expect(commands).toHaveLength(8);
    const directories = commands.map(line => {
      const explicit = line.match(/--output=([^\s]+)/)?.[1];
      if (explicit) return explicit;
      const config = line.match(/--config\s+([^\s]+)/)?.[1];
      if (!config) return 'test-results';
      const source = readFileSync(new URL('../' + config, import.meta.url), 'utf8');
      const output = source.match(/outputDir:\s*['"]([^'"]+)['"]/)?.[1];
      expect(output, `Configured browser run ${config} must declare its evidence directory`).toBeDefined();
      return posix.normalize(posix.join(posix.dirname(config), output!));
    });
    expect(new Set(directories).size).toBe(commands.length);
    expect(directories).toContain('artifacts/cursor-overlay-browser-final-20261106');
    expect(directories).toContain('artifacts/yjs-default-browser');
    expect(directories).toContain('artifacts/yjs-incomplete-room-browser');
    // Preserve the disjoint headed clipboard / remaining headless coverage.
    const standard = commands.filter(line => !line.includes('--config'));
    expect(standard).toHaveLength(5);
    expect(standard[1]).toContain('--headed');
    expect(standard[1]).toContain('--workers=1');
    expect(standard[4]).toContain('--grep-invert "${FOUNTAIN_DISPLAY_CLIPBOARD_PATTERN}"');
  });
});
