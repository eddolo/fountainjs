/** Resolve pointer coordinates in the document that owns the editor view. */
export function caretRangeAtPoint(ownerDocument: Document, x: number, y: number): Range | null {
  const position = ownerDocument.caretPositionFromPoint?.(x, y);
  if (position) {
    const range = ownerDocument.createRange();
    try {
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    } catch {
      return null;
    }
  }
  return ownerDocument.caretRangeFromPoint?.(x, y) ?? null;
}
