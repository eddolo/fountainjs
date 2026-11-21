// Browser text controls expose LF. Keep the original breaks on both sides of each edit.
export function updateSourceText(original, next, before, after) {
  if (!original.includes('\r')) return next;
  const normalized = original.replace(/\r\n?/g, '\n');
  if (normalized === next) return original;
  // Identical adjacent line breaks look the same in a textarea. Locate the
  // actual edit from its caret positions before matching the untouched text.
  const oldEnd = normalized.length - (next.length - after);
  const oldStart = Math.min(before, after, oldEnd);
  const hasEditRange = Number.isInteger(before) && Number.isInteger(after) &&
    before >= 0 && before <= normalized.length && after >= 0 && after <= next.length && oldStart >= 0 &&
    normalized.slice(0, oldStart) === next.slice(0, oldStart) &&
    normalized.slice(oldEnd) === next.slice(after);
  const prefixLimit = hasEditRange ? oldStart : Math.min(normalized.length, next.length);
  const suffixLimit = hasEditRange ? after : 0;
  let start = 0, rawStart = 0;
  while (start < prefixLimit && normalized[start] === next[start]) {
    rawStart += original.startsWith('\r\n', rawStart) ? 2 : 1;
    start++;
  }
  let end = normalized.length, nextEnd = next.length, rawEnd = original.length;
  while (end > start && nextEnd > Math.max(start, suffixLimit) && normalized[end - 1] === next[nextEnd - 1]) {
    rawEnd -= rawEnd >= 2 && original.slice(rawEnd - 2, rawEnd) === '\r\n' ? 2 : 1;
    nextEnd--;
    end--;
  }
  const separator = original.match(/\r\n|[\r\n]/)[0];
  return original.slice(0, rawStart) + next.slice(start, nextEnd).replace(/\n/g, separator) + original.slice(rawEnd);
}
