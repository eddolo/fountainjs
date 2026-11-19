// GitLab's NoteEntity uses a string ID in the UI. The REST note has a numeric ID.
function validId(value) {
  return (typeof value === 'string' || typeof value === 'number') &&
    /^[1-9]\d*$/u.test(String(value)) && Number.isSafeInteger(Number(value));
}

export async function reconcileAppliedSuggestion({
  status, message, projectId, iid, noteId, discussionId, suggestionId, readNote, currentNote, updateNote,
}) {
  if (![400, 409, 422].includes(status) || ![projectId, iid, noteId, suggestionId].every(validId)) return false;

  const path = '/api/:version/projects/' + projectId + '/merge_requests/' + iid + '/notes/' + noteId;
  const matchesSuggestion = entry => String(entry.id) === String(suggestionId);
  // Git can reject the second ref update before Rails records the first reviewer's Applied flag.
  const competingRef = typeof message === 'string' && message.includes('reference does not point to expected object');
  for (const delay of competingRef ? [0, 250, 750, 1500] : [0]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const record = await readNote(path);
    if (record?.id !== Number(noteId) || record.project_id !== Number(projectId) ||
        record.noteable_type !== 'MergeRequest' || record.noteable_iid !== Number(iid)) return false;
    const saved = record.suggestions?.find(matchesSuggestion);
    const note = currentNote();
    if (!saved || String(note?.id) !== String(noteId) || note.discussion_id !== discussionId ||
        !note.suggestions?.some(matchesSuggestion)) return false;
    if (saved.applied === true) {
      updateNote({
        ...note,
        suggestions: note.suggestions.map(entry =>
          matchesSuggestion(entry) ? { ...entry, applied: true, appliable: false } : entry),
      });
      return true;
    }
    if (saved.applied !== false) return false;
  }
  return false;
}
