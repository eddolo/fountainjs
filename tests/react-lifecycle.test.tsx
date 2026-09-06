/** @vitest-environment jsdom */

import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  composeExtensions,
  createCollaborationExtension,
  createEditor,
  type CollaborationAdapter,
  type ExternalPasteReport,
} from '../src';
import { FountainEditor, useFountain } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('React editor lifecycle', () => {
  it('forwards source-aware paste policy to the framework-neutral view', async () => {
    const reports: ExternalPasteReport[] = [];
    const editor = createEditor({ schema: composeExtensions([CoreExtension]).schema });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);

    await act(async () => root.render(
      <FountainEditor editor={editor} paste={{ onReport: (report) => reports.push(report) }} />,
    ));
    const editable = mount.querySelector<HTMLElement>('[role="textbox"]');
    expect(editable).not.toBeNull();
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/html'
        ? '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">3. </span>Third</p>'
        : type === 'text/plain' ? '3. Third' : '',
    } });
    editable?.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
    expect(reports).toContainEqual(expect.objectContaining({
      source: 'microsoft-word',
      outcome: 'inserted-rich-html',
    }));
    const list = editor.state.doc.content.find((node) => node.type.name === 'ordered_list');
    expect(list?.attrs.start).toBe(3);
    expect(list?.textContent).toContain('Third');
    await act(async () => root.unmount());
    editor.destroy();
    mount.remove();
  });

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
