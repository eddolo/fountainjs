/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { AIGeneratedMediaController, createAIGeneratedMediaAdapter } from '../src';
import { FountainAIGeneratedMedia } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('FountainAIGeneratedMedia', () => {
  it('renders a real preview and requires explicit upload-and-insert acceptance', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:generated-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const controller = new AIGeneratedMediaController({
      idFactory: () => 'request-ui',
      adapter: createAIGeneratedMediaAdapter(async (_request, context) => {
        context.reportProgress(.5);
        return { model: 'demo-model', provider: 'host-provider', assets: [{
          id: 'preview-ui', kind: 'image', name: 'preview.png', mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]), alt: 'Accessible preview', caption: 'Review before insertion.',
        }] };
      }),
    });
    const accept = vi.fn(async (_asset, context) => { context.reportProgress(.75); return true; });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);
    await act(async () => root.render(<FountainAIGeneratedMedia
      controller={controller}
      onAccept={accept}
      initialPrompt="A product diagram"
    />));

    expect(mount.querySelector('details')?.textContent).toContain('includesDocumentContent');
    await act(async () => (mount.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(mount.textContent).toContain('Review required');
    expect(mount.textContent).toContain('Review before insertion.');
    expect(mount.querySelector('img')?.getAttribute('src')).toBe('blob:generated-preview');
    expect(mount.querySelector('img')?.getAttribute('alt')).toBe('Accessible preview');
    expect(accept).not.toHaveBeenCalled();

    const insert = [...mount.querySelectorAll('button')].find((button) => button.textContent === 'Upload and insert') as HTMLButtonElement;
    await act(async () => insert.click());
    expect(accept).toHaveBeenCalledOnce();
    expect(mount.textContent).toContain('Inserted');

    await act(async () => root.unmount());
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:generated-preview');
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    mount.remove();
  });
});
