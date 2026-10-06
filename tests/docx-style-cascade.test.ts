// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createWordRunStyleCascade, WORD_TOGGLES, type WordStyleDefinition } from '../src/docx/style-cascade';

const paragraph = (id: string, run: WordStyleDefinition['run'], basedOn?: string): WordStyleDefinition => ({ id, kind: 'paragraph', run, basedOn });
const character = (id: string, run: WordStyleDefinition['run'], basedOn?: string): WordStyleDefinition => ({ id, kind: 'character', run, basedOn });

describe('internal Word run-style cascade', () => {
  it('resolves defaults, paragraph ancestry, character ancestry, then direct formatting without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const resolve = createWordRunStyleCascade({
      defaults: { size: 22, color: '000000', fonts: { ascii: { name: 'Times New Roman' }, hAnsi: { name: 'Times New Roman' } } },
      styles: [paragraph('Title', { size: 48, color: '123456' }, 'Normal'), paragraph('Normal', { size: 24 }),
        character('Emphasis', { toggles: { italic: true }, color: '654321' }), character('Special', { size: 30 }, 'Emphasis')],
    }).resolve;
    const value = resolve({ paragraphStyle: 'Title', characterStyle: 'Special', direct: { size: 25 } });
    expect(value.paragraphChain).toEqual(['Normal', 'Title']);
    expect(value.characterChain).toEqual(['Emphasis', 'Special']);
    expect(value.formatting).toEqual({ size: 25, color: '654321', toggles: { italic: true },
      fonts: { ascii: { name: 'Times New Roman' }, hAnsi: { name: 'Times New Roman' } } });
    expect(value.issues).toEqual([]);
  });

  it.each(WORD_TOGGLES)('distinguishes absent, style false, repeated style true and direct false for %s', property => {
    const resolve = createWordRunStyleCascade({ styles: [
      paragraph('On', { toggles: { [property]: true } }),
      paragraph('NoToggle', { toggles: { [property]: false } }, 'On'),
      paragraph('Twice', { toggles: { [property]: true } }, 'NoToggle'),
    ] }).resolve;
    expect(resolve().formatting.toggles[property]).toBeUndefined();
    expect(resolve({ paragraphStyle: 'NoToggle' }).formatting.toggles[property]).toBe(true);
    expect(resolve({ paragraphStyle: 'Twice' }).formatting.toggles[property]).toBe(false);
    expect(resolve({ paragraphStyle: 'On', direct: { toggles: { [property]: false } } }).formatting.toggles[property]).toBe(false);
    expect(resolve({ paragraphStyle: 'Twice', direct: { toggles: { [property]: true } } }).formatting.toggles[property]).toBe(true);
  });

  it('keeps non-toggle reset values instead of treating them as absent or boolean toggles', () => {
    const resolve = createWordRunStyleCascade({ defaults: { underline: 'single', highlight: 'yellow', color: '112233', verticalAlign: 'superscript' },
      styles: [paragraph('Reset', { underline: 'none', color: 'auto', verticalAlign: 'baseline' })] }).resolve;
    expect(resolve({ paragraphStyle: 'Reset', direct: { highlight: 'none' } }).formatting).toMatchObject({
      underline: 'none', color: 'auto', highlight: 'none', verticalAlign: 'baseline',
    });
  });

  it('applies only the default paragraph style when no style is selected; never adds an implicit Normal ancestor', () => {
    const resolve = createWordRunStyleCascade({ styles: [
      { ...paragraph('Body', { size: 22, toggles: { bold: true } }), isDefault: true },
      paragraph('Independent', { size: 40 }), { ...character('DefaultParagraphFont', { toggles: { italic: true } }), isDefault: true },
    ] }).resolve;
    expect(resolve().formatting.toggles).toEqual({ bold: true });
    expect(resolve({ paragraphStyle: 'Independent' }).formatting).toEqual({ size: 40, toggles: {}, fonts: {} });
    expect(resolve({ paragraphStyle: 'Unknown' }).paragraphChain).toEqual([]);
    expect(resolve({ paragraphStyle: 'Unknown' }).issues).toEqual([{ code: 'missing-style', styleId: 'Unknown' }]);
  });

  it('treats style IDs as case-sensitive identities, not display names or JS object keys', () => {
    const resolve = createWordRunStyleCascade({ styles: [paragraph('__proto__', { size: 32 }), paragraph('constructor', { size: 24 }, '__proto__'),
      paragraph('TITLE', { color: '000000' }), paragraph('title', { color: 'ffffff' })] }).resolve;
    expect(resolve({ paragraphStyle: 'constructor' }).paragraphChain).toEqual(['__proto__', 'constructor']);
    expect(resolve({ paragraphStyle: 'title' }).formatting.color).toBe('ffffff');
    expect(resolve({ paragraphStyle: 'TITLE' }).formatting.color).toBe('000000');
  });

  it('retains the local style when a parent is missing or of the wrong kind and reports the broken reference', () => {
    const resolve = createWordRunStyleCascade({ styles: [paragraph('MissingParent', { size: 32 }, 'Gone'),
      paragraph('WrongParent', { color: '112233' }, 'Char'), character('Char', { toggles: { bold: true } })] }).resolve;
    expect(resolve({ paragraphStyle: 'MissingParent' })).toMatchObject({ paragraphChain: ['MissingParent'], formatting: { size: 32 },
      issues: [{ code: 'missing-style', styleId: 'Gone' }] });
    expect(resolve({ paragraphStyle: 'WrongParent' })).toMatchObject({ paragraphChain: ['WrongParent'], formatting: { toggles: {} },
      issues: [{ code: 'wrong-style-kind', styleId: 'Char' }] });
    expect(resolve({ characterStyle: 'WrongParent' }).issues).toEqual([{ code: 'wrong-style-kind', styleId: 'WrongParent' }]);
  });

  it('does not choose an arbitrary precedence for a cycle, and preserves defaults/direct formatting', () => {
    const resolve = createWordRunStyleCascade({ defaults: { size: 22 }, styles: [
      paragraph('A', { size: 40 }, 'B'), paragraph('B', { size: 50 }, 'A'), paragraph('Child', { size: 60 }, 'A'),
    ] }).resolve;
    for (const paragraphStyle of ['A', 'B', 'Child']) {
      const result = resolve({ paragraphStyle, direct: { color: '112233' } });
      expect(result.paragraphChain).toEqual([]);
      expect(result.formatting).toMatchObject({ size: 22, color: '112233' });
      expect(result.issues[0].code).toBe('style-cycle');
      expect(resolve({ paragraphStyle, direct: { color: '112233' } })).toEqual(result);
    }
  });

  it('bounds ancestry iteratively, including exact depth and self-cycle boundaries', () => {
    const styles = Array.from({ length: 1000 }, (_, index) => paragraph(String(index), { size: 22 }, index ? String(index - 1) : undefined));
    const resolve = createWordRunStyleCascade({ styles, maxDepth: 64 }).resolve;
    expect(resolve({ paragraphStyle: '63' }).paragraphChain).toHaveLength(64);
    expect(resolve({ paragraphStyle: '64' }).issues).toEqual([{ code: 'style-depth-limit', styleId: '0' }]);
    expect(resolve({ paragraphStyle: '999' }).paragraphChain).toEqual([]);
    expect(createWordRunStyleCascade({ styles: [paragraph('Self', {}, 'Self')], maxDepth: 1 }).resolve({ paragraphStyle: 'Self' }).issues[0].code).toBe('style-cycle');
  });

  it('rejects duplicate IDs/defaults and invalid bounds rather than accepting order-dependent formatting', () => {
    expect(() => createWordRunStyleCascade({ styles: [paragraph('A', {}), character('A', {})] })).toThrow(/Duplicate/);
    expect(() => createWordRunStyleCascade({ styles: ['A', 'B'].map(id => ({ ...paragraph(id, {}), isDefault: true })) })).toThrow(/Ambiguous/);
    for (const maxDepth of [0, -1, 1.5, NaN, Infinity, 257]) expect(() => createWordRunStyleCascade({ styles: [], maxDepth })).toThrow(/limits/);
    expect(() => createWordRunStyleCascade({ styles: [paragraph('A', {}), paragraph('B', {})], maxStyles: 1 })).toThrow(/exceed/);
  });

  it('merges fonts per script slot and lets direct named fonts replace inherited theme references', () => {
    const resolve = createWordRunStyleCascade({ defaults: { fonts: { ascii: { theme: 'minorHAnsi' }, hAnsi: { theme: 'minorHAnsi' }, cs: { name: 'Arabic' } } },
      styles: [paragraph('Title', { fonts: { ascii: { name: 'Georgia' }, eastAsia: { name: 'SimSun' } } })] }).resolve;
    expect(resolve({ paragraphStyle: 'Title', direct: { fonts: { ascii: { name: 'Courier New' } } } }).formatting.fonts).toEqual({
      ascii: { name: 'Courier New' }, hAnsi: { theme: 'minorHAnsi' }, eastAsia: { name: 'SimSun' }, cs: { name: 'Arabic' },
    });
  });

  it('chooses theme over name in the same declaration, replaces an earlier name with a nearer theme, and does not invent a fallback', () => {
    const resolve = createWordRunStyleCascade({ defaults: { fonts: { ascii: { name: 'Arial' }, hAnsi: { name: 'Arial' } } }, styles: [] }).resolve;
    expect(resolve({ direct: { fonts: { ascii: { name: 'Times New Roman', theme: 'majorHAnsi' }, hAnsi: {} } } }).formatting.fonts)
      .toEqual({ ascii: { theme: 'majorHAnsi', name: 'Times New Roman' }, hAnsi: { name: 'Arial' } });
  });

  it('keeps complex-script sizes distinct from Latin sizes', () => {
    const resolve = createWordRunStyleCascade({ defaults: { size: 22, sizeCS: 30 }, styles: [paragraph('Title', { size: 48 })] }).resolve;
    expect(resolve({ paragraphStyle: 'Title', direct: { sizeCS: 24 } }).formatting).toMatchObject({ size: 48, sizeCS: 24 });
  });

  it('does not guess Word-specific true-default toggle semantics; a direct override is still authoritative', () => {
    const resolve = createWordRunStyleCascade({ defaults: { toggles: { bold: true } }, styles: [paragraph('Off', { toggles: { bold: false } })] }).resolve;
    expect(resolve().formatting.toggles.bold).toBe(true);
    expect(resolve({ paragraphStyle: 'Off' })).toMatchObject({ formatting: { toggles: { bold: 'unresolved' } },
      issues: [{ code: 'word-default-toggle-unverified', property: 'bold' }] });
    expect(resolve({ paragraphStyle: 'Off', direct: { toggles: { bold: false } } })).toMatchObject({ formatting: { toggles: { bold: false } }, issues: [] });
  });

  it('owns immutable snapshots; later input edits and earlier outputs cannot corrupt the cached cascade', () => {
    const run = { size: 22, fonts: { ascii: { name: 'Arial' } }, toggles: { bold: true } };
    const styles = [paragraph('A', run)];
    const resolve = createWordRunStyleCascade({ styles }).resolve;
    run.size = 48; run.fonts.ascii.name = 'Changed'; run.toggles.bold = false; styles.length = 0;
    const first = resolve({ paragraphStyle: 'A' });
    expect(first.formatting).toMatchObject({ size: 22, fonts: { ascii: { name: 'Arial' } }, toggles: { bold: true } });
    expect(() => { (first.formatting.fonts!.ascii! as { name: string }).name = 'Changed'; }).toThrow();
    expect(() => { (first.paragraphChain as string[]).push('Injected'); }).toThrow();
    expect(resolve({ paragraphStyle: 'A' })).toEqual(first);
    expect(resolve({ paragraphStyle: 'A', direct: { size: 30 } }).formatting.size).toBe(30);
    expect(resolve({ paragraphStyle: 'A' }).formatting.size).toBe(22);
  });

  it('ignores prototype properties and rejects malformed normalized declarations', () => {
    const resolve = createWordRunStyleCascade({ defaults: Object.create({ size: 80, toggles: { bold: true }, fonts: { ascii: { name: 'Injected' } } }), styles: [] }).resolve;
    // Container properties must also be own properties, not inherited from a prototype.
    expect(resolve().formatting).toEqual({ toggles: {}, fonts: {} });
    expect(() => createWordRunStyleCascade({ styles: [], defaults: { size: Infinity } })).toThrow(/Invalid Word size/);
    expect(() => createWordRunStyleCascade({ styles: [], defaults: { toggles: { bold: 'false' as unknown as boolean } } })).toThrow(/Invalid Word toggle/);
  });
});
