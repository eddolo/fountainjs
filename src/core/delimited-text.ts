/** Spreadsheet clipboard text accepts ragged rows; CSV charts require a rectangular grid. */
export function readDelimitedRows(text: string, format: 'tsv' | 'csv'): string[][] | null {
  const csv = format === 'csv';
  const separator = csv ? ',' : '\t';
  const field = csv ? /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n?|\n|$)/gy
    : /(?:"((?:[^"]|"")*)"|([^\t\r\n]*))(\t|\r\n?|\n|$)/gy;
  const rows: string[][] = [[]];
  let width = 0;
  while (true) {
    const match = field.exec(text);
    if (!match) return null;
    const row = rows[rows.length - 1]!;
    row.push(match[1] === undefined ? match[2]! : match[1].replaceAll('""', '"'));
    width = Math.max(width, row.length);
    if (rows.length * width > 10_000) return null;
    if (match[3] !== separator) {
      if (csv && row.length !== rows[0]!.length) return null;
      if (!match[3] || field.lastIndex === text.length) break;
      rows.push([]);
    }
  }
  return csv ? rows : rows.map(row => Array.from({ length: width }, (_, column) => row[column] ?? ''));
}
