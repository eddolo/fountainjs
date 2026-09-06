/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { AIController, CoreSchemaSpec, createEditor, createStreamingAIAdapter } from '../src';
import { FountainAIReview } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('FountainAIReview streaming UI', () => {
  it('shows partial output and a stop action, then enables review only after completion', async () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AIController(editor, createStreamingAIAdapter(async function* () {
      yield { replacementDelta: 'Live' };
      await gate;
      yield { replacementDelta: ' proposal' };
    }));
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);
    await act(async () => root.render(<FountainAIReview controller={controller} />));

    const streamPromise = controller.suggest({ action: 'improve' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mount.textContent).toContain('Generating…');
    expect(mount.textContent).toContain('Live');
    expect(mount.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect([...mount.querySelectorAll('button')].some((button) => button.textContent === 'Accept change')).toBe(false);
    expect([...mount.querySelectorAll('button')].some((button) => button.textContent === 'Stop generating')).toBe(true);
    expect(editor.getText()).toBe('Original');

    await act(async () => {
      release();
      await streamPromise;
    });
    expect(mount.textContent).toContain('Review needed');
    expect(mount.textContent).toContain('Live proposal');
    expect([...mount.querySelectorAll('button')].some((button) => button.textContent === 'Accept change')).toBe(true);
    expect(mount.querySelector('[aria-busy="true"]')).toBeNull();
    expect(editor.getText()).toBe('Original');

    await act(async () => root.unmount());
    editor.destroy();
    mount.remove();
  });
});
