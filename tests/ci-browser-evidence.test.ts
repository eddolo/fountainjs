import { readFileSync } from 'node:fs';
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
  });

  it('keeps preflight outputs separate so later runs cannot remove their failed attempts', () => {
    const commands = workflow.split('\n').filter(line => line.includes('run:') && line.includes('playwright test'));
    expect(commands).toHaveLength(5);
    const directories = commands.map(line => line.match(/--output=([^\s]+)/)?.[1] ?? 'test-results');
    expect(new Set(directories).size).toBe(commands.length);
    // Preserve the disjoint headed clipboard / remaining headless coverage.
    expect(commands[1]).toContain('--headed');
    expect(commands[1]).toContain('--workers=1');
    expect(commands[4]).toContain('--grep-invert "${FOUNTAIN_DISPLAY_CLIPBOARD_PATTERN}"');
  });
});
