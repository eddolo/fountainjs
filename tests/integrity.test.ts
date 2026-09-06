import { describe, expect, it } from 'vitest';
import { Selection, createEditor } from '../src/core';
import { CoreExtension, composeExtensions } from '../src/extensions';
import { TypographyExtension } from '../src/extensions/typography';
import {
  applySelectionSanitization,
  inspectTextIntegrity,
  previewSelectionSanitization,
  previewTextSanitization,
  scanInvisibleCharacters,
} from '../src/integrity';
import {
  InvisibleCharacterExtension,
  getIntegrityDisplayState,
  integrityDisplayKey,
  setShowInvisibles,
  setVerbatimMode,
} from '../src/integrity/dom';

describe('text integrity inspection', () => {
  it('reports exact UTF-16 positions, Unicode names, bytes, endings, and normalization', () => {
    const text = `A\u200bB\u00a0e\u0301\r\n\u202e`;
    const report = inspectTextIntegrity(text);
    expect(report.invisibleCharacters.map(({ kind, index }) => ({ kind, index }))).toEqual([
      { kind: 'zero-width-space', index: 1 },
      { kind: 'no-break-space', index: 3 },
      { kind: 'crlf', index: 6 },
      { kind: 'bidi-control', index: 8 },
    ]);
    expect(report.codePoints.find((point) => point.index === 1)).toMatchObject({
      codePoint: 'U+200B', utf8Hex: 'E2 80 8B', name: 'ZERO WIDTH SPACE',
    });
    expect(report.lineEndings).toEqual({ lf: 0, crlf: 1, cr: 0, mixed: false });
    expect(report.normalization.currentForms).not.toContain('NFC');
    expect(report.accessibleSummary).toContain('3 warnings');
    expect(Object.isFrozen(report.codePoints)).toBe(true);
  });

  it('can hide ordinary spaces without hiding integrity warnings', () => {
    const findings = scanInvisibleCharacters('a b\u2060c', { spaces: false });
    expect(findings.map((finding) => finding.kind)).toEqual(['word-joiner']);
  });

  it('reports the standard UTF-8 replacement for an isolated surrogate', () => {
    const report = inspectTextIntegrity('\ud800');
    expect(report.codePoints[0]).toMatchObject({
      codePoint: 'U+D800', utf8Hex: 'EF BF BD', invisible: 'unpaired-surrogate',
    });
  });

  it('previews only explicitly selected sanitation categories', () => {
    const source = `key\u200b\u00a0value\t\r\nR\u202e`;
    const preview = previewTextSanitization(source, {
      zeroWidthSpace: 'remove',
      noBreakSpace: 'space',
      tabs: 'spaces',
      tabSize: 4,
      lineEndings: 'lf',
    });
    expect(preview.result).toBe('key value    \nR\u202e');
    expect(preview.edits.map((edit) => edit.kind)).toEqual([
      'zero-width-space', 'no-break-space', 'tab', 'crlf',
    ]);
    expect(preview.after.invisibleCharacters.some((finding) => finding.kind === 'bidi-control')).toBe(true);
    expect(preview.policy.bidiControls).toBeUndefined();
  });

  it('guards explicit selection sanitation against stale content', () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A\u200bB' }] }] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 0, 3)));
    const preview = previewSelectionSanitization(editor, { zeroWidthSpace: 'remove' });
    expect(preview?.result).toBe('AB');
    expect(applySelectionSanitization(editor, preview!)).toBe(true);
    expect(editor.state.doc.textContent).toBe('AB');
    expect(applySelectionSanitization(editor, preview!)).toBe(false);
    editor.destroy();
  });
});

describe('invisible-character DOM extension', () => {
  it('adds bounded view-only markers only while display is enabled', () => {
    const kit = composeExtensions([CoreExtension, InvisibleCharacterExtension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc', content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'A B\u200b' },
          { type: 'hard_break' },
          { type: 'text', text: 'C' },
        ] }],
      },
    });
    const documentBeforeDisplay = editor.state.doc.toJSON();
    const plugin = editor.state.plugins.find((candidate) => candidate.key === integrityDisplayKey);
    expect((plugin?.spec.props?.decorations?.(editor.state) as any).decorations).toHaveLength(0);
    expect(setShowInvisibles(editor, true)).toBe(true);
    expect(getIntegrityDisplayState(editor)).toMatchObject({ showInvisibles: true });
    const decorations = plugin?.spec.props?.decorations?.(editor.state);
    const list = 'decorations' in (decorations as any) ? (decorations as any).decorations : decorations;
    expect(list.map((decoration: any) => decoration.attrs['data-fountain-invisible'])).toEqual([
      undefined, 'space', 'zero-width-space', 'hard-break',
    ]);
    expect(editor.state.doc.toJSON()).toEqual(documentBeforeDisplay);
    editor.destroy();
  });

  it('keeps code input literal before typography and paste transformations', () => {
    const kit = composeExtensions([CoreExtension, InvisibleCharacterExtension, TypographyExtension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [
        { type: 'code_block', attrs: { language: 'text', lineNumbers: false }, content: [{ type: 'text', text: '-' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'outside' }] },
      ] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
    expect(setVerbatimMode(editor, true)).toBe(true);
    expect(getIntegrityDisplayState(editor)).toMatchObject({ verbatimRequested: true, verbatimActive: true });
    const handled = editor.state.plugins.some((plugin) => plugin.spec.props?.handleTextInput?.(editor, 1, 1, '-'));
    expect(handled).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('--');
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 0], 1)));
    expect(getIntegrityDisplayState(editor)).toMatchObject({ verbatimRequested: true, verbatimActive: false });
    editor.destroy();
  });
});
