/** @vitest-environment jsdom */

import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  composeExtensions,
  createCollaborationExtension,
  type CollaborationAdapter,
} from '../src';
import { useFountain } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('React editor lifecycle', () => {
  it('creates, connects, and destroys one editor across repeated Strict Mode effects', async () => {
    const adapters: CollaborationAdapter[] = [];
    const connect = vi.fn();
    const disconnect = vi.fn();
    const destroy = vi.fn();
    const collaboration = createCollaborationExtension({
      adapter: () => {
        const adapter = { connect, disconnect, destroy };
        adapters.push(adapter);
        return adapter;
      },
    });
    const kit = composeExtensions([CoreExtension, collaboration]);
    function Harness() {
      const editor = useFountain({ schema: kit.schema, plugins: kit.plugins });
      return <output data-editor-alive>{String(!editor.isDestroyed)}</output>;
    }

    for (let cycle = 1; cycle <= 20; cycle += 1) {
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      const root = createRoot(mount);
      await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
      expect(mount.querySelector('[data-editor-alive]')?.textContent).toBe('true');
      expect(adapters).toHaveLength(cycle);
      expect(connect).toHaveBeenCalledTimes(cycle);

      await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
      expect(adapters).toHaveLength(cycle);
      expect(connect).toHaveBeenCalledTimes(cycle);

      await act(async () => root.unmount());
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(disconnect).toHaveBeenCalledTimes(cycle);
      expect(destroy).toHaveBeenCalledTimes(cycle);
      mount.remove();
    }
  });
});
