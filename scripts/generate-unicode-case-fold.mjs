import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const version = '17.0.0';
const sourceURL = `https://www.unicode.org/Public/${version}/ucd/CaseFolding.txt`;
const destination = new URL('../src/core/unicode-case-fold-data.ts', import.meta.url);
const response = await fetch(sourceURL);
if (!response.ok) throw new Error(`Unable to download ${sourceURL}: HTTP ${response.status}`);
const source = await response.text();
const digest = createHash('sha256').update(source).digest('hex');
const mappings = new Map();

for (const line of source.split(/\r?\n/u)) {
  // Full/default folding uses common (C) and full (F) mappings. Simple (S)
  // and locale-specific Turkic (T) mappings are intentionally excluded.
  const match = /^([0-9A-F]+); ([CF]); ([0-9A-F ]+);/u.exec(line);
  if (!match) continue;
  mappings.set(
    Number.parseInt(match[1], 16),
    match[3].split(' ').map((value) => Number.parseInt(value, 16)),
  );
}

const entries = [...mappings].sort(([left], [right]) => left - right);
const ranges = [];
const exceptions = [];
for (let index = 0; index < entries.length;) {
  const [first, replacement] = entries[index];
  const next = entries[index + 1];
  const step = next ? next[0] - first : 0;
  const delta = replacement[0] - first;
  let end = index + 1;
  if (replacement.length === 1 && (step === 1 || step === 2)) {
    while (end < entries.length) {
      const [codePoint, target] = entries[end];
      if (codePoint !== first + (end - index) * step || target.length !== 1 || target[0] - codePoint !== delta) break;
      end += 1;
    }
  }
  if (end - index >= 3) {
    ranges.push([first, entries[end - 1][0], step, delta]);
    index = end;
  } else {
    exceptions.push(entries[index]);
    index += 1;
  }
}
const hex = (codePoint) => `0x${codePoint.toString(16).toUpperCase()}`;
const escaped = (codePoints) => codePoints
  .map((codePoint) => `\\u{${codePoint.toString(16).toUpperCase()}}`)
  .join('');
const rows = exceptions.map(([codePoint, replacement]) => (
  `  ${hex(codePoint)}: '${escaped(replacement)}',`
));
const output = `/**
 * Generated from Unicode ${version} CaseFolding.txt.
 * Source: ${sourceURL}
 * SHA-256: ${digest}
 *
 * Regenerate with: node scripts/generate-unicode-case-fold.mjs
 */
// Sorted, disjoint ranges of single-code-point mappings.
export const FULL_CASE_FOLD_RANGES: readonly (readonly [first: number, last: number, step: number, delta: number])[] = [
${ranges.map(([first, last, step, delta]) => `  [${hex(first)}, ${hex(last)}, ${step}, ${delta}],`).join('\n')}
];

export const FULL_CASE_FOLD_EXCEPTIONS: Readonly<Record<number, string | undefined>> = Object.freeze({
${rows.join('\n')}
});
`;

await writeFile(destination, output, 'utf8');
console.log(`Wrote ${mappings.size} Unicode case folds as ${ranges.length} ranges and ${exceptions.length} exceptions.`);
