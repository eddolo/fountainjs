// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { CoreExtension, composeExtensions, createEditor } from '../src';
import {
  addTrackedReplacement,
  createTrackedChangesExtension,
  getTrackedChangesState,
} from '../src/tracked-changes';
import { FountainTrackedChanges } from '../src/react/tracked-changes';

describe('FountainTrackedChanges', () => {
  it('shows full review information and drives selection, discussion, and decisions', async () => {
    const tracked = createTrackedChangesExtension({
      user: { id: 'ada', name: 'Ada Lovelace — full author name' },
      idFactory: () => 'review-1',
      now: () => '2026-09-04T12:00:00.000Z',
    });
    const kit = composeExtensions([CoreExtension, tracked]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A very long original sentence that must remain inspectable.' }] }] },
    });
    addTrackedReplacement(editor, [0, 0], 0, 59, 'A complete and equally inspectable replacement.', 'Clarity for every reader');
    const discuss = vi.fn();
    const mount = document.createElement('div');
    const root = createRoot(mount);
    await act(async () => root.render(<FountainTrackedChanges editor={editor} onCreateComment={discuss} />));

    expect(mount.textContent).toContain('Ada Lovelace — full author name');
    expect(mount.textContent).toContain('A very long original sentence that must remain inspectable.');
    expect(mount.textContent).toContain('A complete and equally inspectable replacement.');
    expect(mount.textContent).toContain('Clarity for every reader');
    expect(mount.querySelector('.fountain-tracked-change-card__summary')?.getAttribute('title')).toContain('→');

    await act(async () => mount.querySelector<HTMLButtonElement>('.fountain-tracked-change-card__focus')?.click());
    expect(getTrackedChangesState(editor)?.selectedSuggestionId).toBe('review-1');
    await act(async () => mount.querySelectorAll<HTMLButtonElement>('footer button')[2]?.click());
    expect(discuss).toHaveBeenCalledWith(expect.objectContaining({ id: 'review-1' }));

    await act(async () => mount.querySelectorAll<HTMLButtonElement>('footer button')[0]?.click());
    expect(getTrackedChangesState(editor)?.suggestions).toHaveLength(0);
    expect(mount.textContent).toContain('No changes to review.');
    await act(async () => root.unmount());
  });
});
