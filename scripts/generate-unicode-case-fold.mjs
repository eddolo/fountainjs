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

const exceptions = [...mappings]
  .filter(([codePoint, replacement]) => (
    String.fromCodePoint(codePoint).toLowerCase() !== String.fromCodePoint(...replacement)
  ));
const escaped = (codePoints) => codePoints
  .map((codePoint) => `\\u{${codePoint.toString(16).toUpperCase()}}`)
  .join('');
const rows = exceptions.map(([codePoint, replacement]) => (
  `  0x${codePoint.toString(16).toUpperCase()}: '${escaped(replacement)}',`
));
const output = `/**
 * Generated from Unicode ${version} CaseFolding.txt.
 * Source: ${sourceURL}
 * SHA-256: ${digest}
 *
 * Only mappings that differ from ECMAScript String#toLowerCase are retained.
 * Regenerate with: node scripts/generate-unicode-case-fold.mjs
 */
export const FULL_CASE_FOLD_EXCEPTIONS: Readonly<Record<number, string | undefined>> = Object.freeze({
${rows.join('\n')}
});
`;

await writeFile(destination, output, 'utf8');
console.log(`Wrote ${exceptions.length} Unicode case-fold exceptions to ${destination.pathname}`);
