/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec, createEditor } from '../src';
import { FountainVersions } from '../src/react/versions';
import { InMemoryVersionProvider, VersionController } from '../src/versions';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
}

describe('FountainVersions', () => {
  it('keeps complete names and content visible while driving preview, comparison, and confirmed restore', async () => {
    let nextId = 0;
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The complete original paragraph remains inspectable.' }] }],
      },
    });
    const controller = new VersionController({
      editor,
      provider: new InMemoryVersionProvider(),
      documentId: 'document-1',
      user: { id: 'ada', name: 'Ada Lovelace' },
      idFactory: (kind) => `${kind}-${++nextId}`,
      now: () => '2026-09-04T12:00:00.000Z',
      autoLoad: false,
    });
    await controller.save({ name: 'A deliberately complete version name that must wrap and never disappear behind an ellipsis' });
    editor.dispatch(editor.state.createTransaction().replaceText(
      [0, 0],
      0,
      editor.getText().length,
      'The complete current paragraph also remains inspectable.',
    ));

    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);
    const errors = vi.fn();
    await act(async () => root.render(<FountainVersions controller={controller} onError={errors} />));

    expect(mount.querySelector('[aria-label="Version history"]')).not.toBeNull();
    expect(mount.textContent).toContain('A deliberately complete version name that must wrap and never disappear behind an ellipsis');
    expect(mount.textContent).toContain('Unsaved changes');
    const buttons = () => [...mount.querySelectorAll<HTMLButtonElement>('button')];

    await act(async () => {
      buttons().find((button) => button.textContent === 'Preview')?.click();
      await Promise.resolve();
    });
    expect(mount.querySelector('.fountain-version-preview')?.textContent).toContain('The complete original paragraph remains inspectable.');
    expect(editor.getText()).toBe('The complete current paragraph also remains inspectable.');

    await act(async () => {
      buttons().find((button) => button.textContent === 'Compare to current')?.click();
      await Promise.resolve();
    });
    const comparison = mount.querySelector('.fountain-version-comparison');
    expect(comparison?.textContent).toContain('original paragraph');
    expect(comparison?.textContent).toContain('current paragraph also');

    const restore = buttons().find((button) => button.textContent === 'Restore');
    await act(async () => restore?.click());
    expect(restore?.textContent).toBe('Confirm restore');
    expect(editor.getText()).toBe('The complete current paragraph also remains inspectable.');
    await act(async () => {
      restore?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editor.getText()).toBe('The complete original paragraph remains inspectable.');
    expect(errors).not.toHaveBeenCalled();

    const input = mount.querySelector<HTMLInputElement>('.fountain-versions__save input');
    await act(async () => setInput(input as HTMLInputElement, 'Another complete named state'));
    expect(input?.value).toBe('Another complete named state');

    await act(async () => root.unmount());
    controller.destroy();
    editor.destroy();
    mount.remove();
  });
});
