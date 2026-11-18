/** Spreadsheet clipboard text accepts ragged rows; CSV charts require a rectangular grid. */
export function readDelimitedRows(text: string, format: 'tsv' | 'csv' | 'chart', separator: ',' | '\t' | ';' | '|' | null = format === 'csv' ? ',' : '\t'): string[][] | null {
  const csv = format === 'csv';
  const chart = format === 'chart';
  const delimiter = separator === '|' ? '\\|' : separator ?? '';
  // Only the chart text entry accepts spaces between a quoted cell and its separator.
  const chartField = () => new RegExp('(?: *"((?:[^"]|"")*)" *|([^"' + delimiter + '\\r\\n]*))(' + (delimiter ? delimiter + '|' : '') + '\\r\\n?|\\n|$)', 'gy');
  const field = chart ? chartField() : csv ? /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n?|\n|$)/gy
    : /(?:"((?:[^"]|"")*)"|([^\t\r\n]*))(\t|\r\n?|\n|$)/gy;
  const rows: string[][] = [[]];
  let width = 0;
  while (true) {
    const match = field.exec(text);
    if (!match) {
      if (chart) throw new Error('Check the quotation marks in row ' + rows.length + '.');
      return null;
    }
    const row = rows[rows.length - 1]!;
    const plain = match[2] ?? '';
    row.push(match[1] === undefined ? (chart ? plain.trim() : plain) : match[1].replaceAll('""', '"'));
    width = Math.max(width, row.length);
    if (rows.length * width > 10_000) {
      if (chart) throw new Error('Use up to 10,000 cells per chart.');
      return null;
    }
    if (match[3] !== separator) {
      if ((csv || chart) && row.length !== rows[0]!.length) {
        if (chart) throw new Error('Row ' + rows.length + ' has ' + row.length + ' cells. Expected ' + rows[0]!.length + '.');
        return null;
      }
      if (!match[3] || field.lastIndex === text.length) break;
      rows.push([]);
    }
  }
  return csv || chart ? rows : rows.map(row => Array.from({ length: width }, (_, column) => row[column] ?? ''));
}
