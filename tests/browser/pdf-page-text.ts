/** PDF.js may split a word into font/ligature runs. Item boundaries are not spaces. */
export function pdfPageText(items: readonly ({ str: string; hasEOL?: boolean } | { type: string })[]): string {
  return items.flatMap(item => 'str' in item ? [item.str, item.hasEOL ? '\n' : ''] : [])
    .join('').replace(/\s+/gu, ' ').trim();
}
