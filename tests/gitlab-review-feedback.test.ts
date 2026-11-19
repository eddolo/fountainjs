import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error This private integration module also runs in the pinned GitLab frontend.
import { reconcileAppliedSuggestion } from '../integrations/gitlab/services/reconcile_applied_suggestion.js';

function fixture() {
  const sibling = { id: 4, applied: false, appliable: true };
  const target = { id: 5, applied: false, appliable: true, diff_lines: ['old', 'new'] };
  const current = { id: 3, discussion_id: 'review', note: 'Updated prose', suggestions: [sibling, target] };
  const saved = { id: 3, noteable_type: 'MergeRequest', noteable_iid: 2, project_id: 1, suggestions: [{ id: 5, applied: true }] };
  return {
    status: 400, projectId: 1, iid: 2, discussionId: 'review', noteId: 3, suggestionId: 5,
    readNote: vi.fn().mockResolvedValue(saved), currentNote: vi.fn().mockReturnValue(current), updateNote: vi.fn(),
    current, saved,
  };
}

describe('GitLab review feedback after a competing confirmation', () => {
  it('updates only the confirmed suggestion in the currently displayed note', async () => {
    const input = fixture();
    expect(await reconcileAppliedSuggestion(input)).toBe(true);
    expect(input.readNote).toHaveBeenCalledExactlyOnceWith('/api/:version/projects/1/merge_requests/2/notes/3');
    expect(input.updateNote).toHaveBeenCalledExactlyOnceWith({ ...input.current, suggestions: [
      input.current.suggestions[0], { ...input.current.suggestions[1], applied: true, appliable: false },
    ] });
    expect(input.current.suggestions[1]?.applied).toBe(false);
  });

  it.each([true, false])('waits for the persisted decision on a competing ref update (%s)', async eventuallyApplied => {
    const input = fixture();
    const pending = { ...input.saved, suggestions: [{ id: 5, applied: false }] };
    input.readNote.mockResolvedValue(eventuallyApplied ? input.saved : pending).mockResolvedValueOnce(pending);
    vi.useFakeTimers();
    try {
      const result = reconcileAppliedSuggestion({ ...input, message: '9:reference update: reference does not point to expected object.' });
      await vi.runAllTimersAsync();
      expect(await result).toBe(eventuallyApplied);
      expect(input.readNote).toHaveBeenCalledTimes(eventuallyApplied ? 2 : 4);
      expect(input.updateNote).toHaveBeenCalledTimes(eventuallyApplied ? 1 : 0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts the string note ID used by the GitLab discussion UI', async () => {
    const input = fixture();
    input.currentNote.mockReturnValue({ ...input.current, id: '3' });
    expect(await reconcileAppliedSuggestion({ ...input, noteId: '3' })).toBe(true);
    expect(input.updateNote.mock.calls[0]?.[0].id).toBe('3');
  });

  it.each(['03', '3/notes/4', '', null, 1.1])('rejects a malformed note ID %j before reading', async noteId => {
    const input = fixture();
    expect(await reconcileAppliedSuggestion({ ...input, noteId })).toBe(false);
    expect(input.readNote).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 500])('keeps the original HTTP %i failure', async status => {
    const input = fixture();
    expect(await reconcileAppliedSuggestion({ ...input, status })).toBe(false);
    expect(input.readNote).not.toHaveBeenCalled();
    expect(input.updateNote).not.toHaveBeenCalled();
  });

  it.each([
    { id: 6 }, { project_id: 7 }, { noteable_iid: 8 }, { noteable_type: 'Issue' },
    { suggestions: [] }, { suggestions: [{ id: 5, applied: false }] }, { suggestions: [{ id: 4, applied: true }] },
  ])('requires the same persisted target to be applied', async changed => {
    const input = fixture();
    input.readNote.mockResolvedValue({ ...input.saved, ...changed });
    expect(await reconcileAppliedSuggestion(input)).toBe(false);
    expect(input.updateNote).not.toHaveBeenCalled();
  });

  it('preserves a replacement displayed while the status read was pending', async () => {
    const input = fixture();
    input.readNote.mockImplementation(async () => {
      input.currentNote.mockReturnValue({ ...input.current, suggestions: [{ id: 12, applied: false }] });
      return input.saved;
    });
    expect(await reconcileAppliedSuggestion(input)).toBe(false);
    expect(input.updateNote).not.toHaveBeenCalled();
  });
});
