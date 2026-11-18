import { expect, it } from 'vitest';
import { pdfPageText } from './browser/pdf-page-text';

it('joins font and ligature runs without inventing spaces inside words', () => {
  expect(pdfPageText([{ str: 'Before the ' }, { str: 'fi' }, { str: 'gures', hasEOL: true },
    { str: 'Local ' }, { str: 'fi' }, { str: 'gure caption' }]))
    .toBe('Before the figures Local figure caption');
});

it('retains explicit word spaces and end-of-line boundaries, ignoring marked-content metadata', () => {
  expect(pdfPageText([{ type: 'beginMarkedContent' }, { str: 'One' }, { str: ' ' }, { str: 'word', hasEOL: true },
    { type: 'endMarkedContent' }, { str: 'Next line', hasEOL: true }])).toBe('One word Next line');
});

it('still distinguishes missing text, reordered text, broken word spacing and real word breaks', () => {
  const expected = 'Before the figures';
  for (const items of [
    [{ str: 'Before the ' }, { str: 'gures' }],
    [{ str: 'Before the ' }, { str: 'gures' }, { str: 'fi' }],
    [{ str: 'Before the ' }, { str: 'fi ' }, { str: 'gures' }],
    [{ str: 'Before the ' }, { str: 'fi', hasEOL: true }, { str: 'gures' }],
  ]) expect(pdfPageText(items)).not.toBe(expected);
});
