// @vitest-environment node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core/schema';
import { CoreSchemaSpec } from '../src/extensions';
import { containedTextDirection, firstStrongDirection, firstStrongDirectionInText, sharedTextDirections, strongDirectionOfCodePoint } from '../src/core/first-strong-direction';

const fixture = readFileSync(new URL('./fixtures/unicode/DerivedBidiClass-17.0.0.txt', import.meta.url));

describe('portable first-strong direction foundation', () => {
  it('pins the official data and generated output', () => {
    expect(createHash('sha256').update(fixture).digest('hex')).toBe('4867b4b7f0731ed1bfcd34cc6251211ff1542541fce0734b6fbda139ee80b3a4');
    expect(execFileSync(process.execPath, ['scripts/generate-bidi-strong.mjs', '--check'], { encoding: 'utf8' })).toContain('verified');
  });

  it('matches all 1,114,112 Unicode code points, including default/unassigned classes', () => {
    // Independent line parser/reference table, not the range generator's regex
    // or compressed binary-search lookup. Explicit neutral classes override
    // missing defaults just as explicit strong classes do.
    const expected = new Uint8Array(0x110000).fill(1);
    const apply = (range: string, value: string) => {
      const [start, end = start] = range.trim().split('..').map(value => parseInt(value, 16));
      const code = value === 'L' || value === 'Left_To_Right' ? 1 : ['R', 'AL', 'Right_To_Left', 'Arabic_Letter'].includes(value) ? 2 : 0;
      for (let point = start; point <= end; point += 1) expected[point] = code;
    };
    const lines = fixture.toString('utf8').split('\n');
    for (const line of lines.filter(line => line.startsWith('# @missing:'))) {
      const [range, value] = line.slice('# @missing:'.length).split(';').map(part => part.trim());
      apply(range, value);
    }
    for (const line of lines) {
      const body = line.split('#')[0].trim();
      if (!body) continue;
      const [range, value] = body.split(';').map(part => part.trim());
      apply(range, value);
    }
    let mismatch: string | undefined;
    for (let point = 0; point < expected.length; point += 1) {
      const actual = strongDirectionOfCodePoint(point);
      if (actual !== [null, 'ltr', 'rtl'][expected[point]]) { mismatch = `U+${point.toString(16)}: ${actual} / ${expected[point]}`; break; }
    }
    expect(mismatch).toBeUndefined();
  });

  it.each([
    ['', null], ['123 \t\n.,😀', null], ['\u0301\u05b0 123 שלום', 'rtl'],
    ['١٢٣ العربية', 'rtl'], ['١٢٣ English', 'ltr'], ['😀 𞤀 Adlam', 'rtl'],
    ['😀 𝒜 שלום', 'ltr'], ['\u200fEnglish', 'rtl'], ['\u200eשלום', 'ltr'],
    ['\u202b\u2067\u2069\u202c English', 'ltr'], ['\u200b\ufeffשלום', 'rtl'],
    ['English שלום', 'ltr'], ['שלום English', 'rtl'], ['€٠١٢ --', null],
  ] as const)('classifies %j without changing its characters', (text, expected) => {
    expect(typeof globalThis.document).toBe('undefined');
    const before = Buffer.from(text).toString('hex');
    expect(firstStrongDirection(text)).toBe(expected);
    expect(Buffer.from(text).toString('hex')).toBe(before);
  });

  it.each([-1, 0x110000, 0.5, NaN, Infinity])('does not classify invalid point %j', point => {
    expect(strongDirectionOfCodePoint(point)).toBeNull();
  });

  it('streams through weak-only nodes and stops before later content', () => {
    function* text() { yield '123😀'; yield 'שלום'; throw new Error('Later text should not be read'); }
    expect(firstStrongDirectionInText(text())).toBe('rtl');
    expect(firstStrongDirectionInText(['\u05b0', '٠١٢', 'Latin'])).toBe('ltr');
    expect(firstStrongDirectionInText([])).toBeNull();
  });

  it('excludes nested declared contexts while keeping eligible nested text and marks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const p = (text: string, dir?: string) => schema.node('paragraph', dir ? { dir } : {}, [schema.text(text, [schema.mark('strong')])]);
    const root = schema.node('blockquote', { dir: 'auto' }, [p('Latin excluded', 'ltr'), p('Arabic excluded', 'auto'),
      schema.node('blockquote', {}, [p('123'), p('שלום')]), p('Latin later')]);
    const before = root.toJSON();
    expect(containedTextDirection(root)).toBe('rtl');
    expect(root.toJSON()).toEqual(before);
    expect(containedTextDirection(schema.node('blockquote', { dir: 'rtl' }, [p('123😀')]))).toBeNull();
  });

  it('uses document text rather than media alternatives, custom toText or isolated source', () => {
    const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      html_inert_raw_text: { inline: true, group: 'inline', content: 'text*' },
      custom: { group: 'block', content: 'block*', toText: () => 'Latin fake label' },
    } });
    const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const root = schema.node('doc', {}, [schema.node('image_super', { src: '/image.png', alt: 'Latin alternative' }),
      schema.node('custom', {}, [p('שלום ignored')]),
      schema.node('paragraph', {}, [schema.node('html_inert_raw_text', {}, [schema.text('Latin script')]), schema.text('العربية')])]);
    expect(containedTextDirection(root, node => node.type.name === 'custom')).toBe('rtl');
    expect(containedTextDirection(schema.node('custom'))).toBeNull();
  });

  it('does not read later siblings or overflow the call stack in deep content', () => {
    const schema = new Schema(CoreSchemaSpec);
    const text = schema.text('שלום');
    // A guarded read-only node interface proves short-circuiting without a
    // timing threshold or allocating a giant document during this unit test.
    const guarded = { isText: false, childCount: 100_000, child(index: number) {
      if (index > 0) throw new Error('Read past the first strong child');
      return text;
    } } as unknown as typeof text;
    expect(containedTextDirection(guarded)).toBe('rtl');
    let deep = schema.node('blockquote', {}, [text]);
    for (let index = 0; index < 10_000; index += 1) deep = schema.node('blockquote', {}, [deep]);
    expect(containedTextDirection(deep)).toBe('rtl');
  });

  it('respects original inert-wrapper direction without interpreting invalid direction as an exclusion', () => {
    const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      html_inert_inline: { inline: true, group: 'inline', content: 'text*' },
    } });
    const wrapper = (dir: string) => schema.node('html_inert_inline', { attributes: { dir } }, [schema.text('Latin source')]);
    const root = (dir: string) => schema.node('paragraph', { dir: 'auto' }, [wrapper(dir), schema.text('שלום')]);
    for (const dir of ['ltr', 'RTL', 'aUtO']) expect(containedTextDirection(root(dir))).toBe('rtl');
    for (const dir of ['', ' rtl ', 'invalid']) expect(containedTextDirection(root(dir))).toBe('ltr');
  });

  // Test-local membership data is NOT a shipped schema or author command.
  // These contracts exercise the semantic join before choosing its persistent
  // ownership/identity/import/collaboration boundary.
  const schema = new Schema(CoreSchemaSpec);
  const paragraph = (text: string, attrs: Record<string, unknown> = {}) => schema.node('paragraph', attrs, [schema.text(text)]);
  const member = (content: ReturnType<Schema['node']>[], group = 'shared') => schema.node('blockquote', { dir: 'auto', testGroup: group }, content);
  const groupOf = (node: ReturnType<Schema['node']>) => node.attrs.dir === 'auto' && typeof node.attrs.testGroup === 'string' ? node.attrs.testGroup : null;

  it('joins fragmented members without unrelated fixed ancestors determining the shared direction', () => {
    const original = member([paragraph('שלום anchor'), paragraph('English selected'), paragraph('English tail')]);
    const fragments = schema.node('doc', { title: 'Keep root metadata' }, [
      schema.node('blockquote', { dir: 'ltr' }, [paragraph('Outer parent'), member([paragraph('שלום anchor')])]),
      member([paragraph('English selected'), member([paragraph('English tail')])]), paragraph('Unrelated Latin'),
    ]);
    const before = fragments.toJSON();
    expect(sharedTextDirections(original, groupOf).get('shared')).toBe('rtl');
    expect(sharedTextDirections(fragments, groupOf).get('shared')).toBe('rtl');
    expect(fragments.toJSON()).toEqual(before);
  });

  it('recomputes shared direction from current members after anchor editing and deletion', () => {
    const make = (anchor: string | null, moved = 'English selected') => schema.node('doc', {}, [
      ...(anchor === null ? [] : [member([paragraph(anchor)])]), member([paragraph(moved)]),
    ]);
    expect(sharedTextDirections(make('שלום anchor'), groupOf).get('shared')).toBe('rtl');
    expect(sharedTextDirections(make('English שלום anchor'), groupOf).get('shared')).toBe('ltr');
    expect(sharedTextDirections(make(null), groupOf).get('shared')).toBe('ltr');
    expect(sharedTextDirections(make(null, 'العربية'), groupOf).get('shared')).toBe('rtl');
  });

  it('keeps independent nested groups and explicit child contexts independently owned', () => {
    const root = member([
      paragraph('Latin excluded', { dir: 'ltr' }),
      member([paragraph('العربية')], 'independent'),
      paragraph('123'), paragraph('English eligible'),
    ]);
    expect([...sharedTextDirections(root, groupOf)]).toEqual([['shared', 'ltr'], ['independent', 'rtl']]);
  });

  it('respects reordered first members and distinguishes no-strong from resolved LTR', () => {
    const rtl = member([paragraph('שלום')]), ltr = member([paragraph('English')]);
    expect(sharedTextDirections(schema.node('doc', {}, [rtl, ltr]), groupOf).get('shared')).toBe('rtl');
    expect(sharedTextDirections(schema.node('doc', {}, [ltr, rtl]), groupOf).get('shared')).toBe('ltr');
    expect(sharedTextDirections(member([paragraph('123😀')]), groupOf).get('shared')).toBeNull();
    expect(sharedTextDirections(paragraph('Unowned text'), groupOf).size).toBe(0);
  });

  it('handles deeply nested members iteratively and excludes custom isolated content', () => {
    let root = member([paragraph('שלום')]);
    for (let index = 0; index < 10_000; index += 1) root = schema.node('blockquote', {}, [root]);
    expect(sharedTextDirections(root, groupOf).get('shared')).toBe('rtl');
    const isolated = member([paragraph('English isolated', { isolate: true }), paragraph('שלום eligible')]);
    expect(sharedTextDirections(isolated, groupOf, node => node.attrs.isolate === true).get('shared')).toBe('rtl');
  });

  it('lets the declared ownership accessor detach a member after an explicit direction override', () => {
    const root = schema.node('doc', {}, [
      schema.node('blockquote', { dir: 'ltr', testGroup: 'shared' }, [paragraph('English override')]),
      member([paragraph('שלום still eligible')]),
    ]);
    expect(sharedTextDirections(root, groupOf).get('shared')).toBe('rtl');
  });
});
