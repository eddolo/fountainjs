// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parse } from 'parse5';
import { Schema, HTMLExporter, Editor, EditorState, createHistoryPlugin, undo, redo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { importHTMLSourceDocument, exportHTMLSource } from '../src/html/source';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const importSource = (source: string) => importHTMLSourceDocument(source, schema).document;
describe('HTML source document envelope', () => {
  it.each([
    '<!doctype html>', '<!DoCtYpE HTML>',
    '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    '<!DOCTYPE html SYSTEM "about:legacy-compat">', '',
  ])('retains declaration and mode through source, safe HTML and native JSON: %s', declaration => {
    expect(typeof document).toBe('undefined');
    const source = `${declaration}<html><head></head><body><p>Evidence</p></body></html>`;
    const doc = importSource(source), envelope = doc.attrs.htmlSourceEnvelope;
    expect(envelope).toEqual({ version: 1, doctype: declaration || null, mode: parse(source).mode });
    expect(schema.nodeFromJSON(doc.toJSON()).toJSON()).toEqual(doc.toJSON());
    const result = exportHTMLSource(doc);
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    if (result.ok) {
      expect(parse(result.sourceHTML).mode).toBe(parse(source).mode);
      expect(result.sourceHTML.startsWith(declaration || '<html>')).toBe(true);
      expect(importSource(result.sourceHTML).toJSON()).toEqual(doc.toJSON());
      expect(result.modelRoundTrip).toBe('equal-except-source-tokens');
    }
    const safe = HTMLExporter.export(doc);
    expect(parse(safe).mode).toBe('no-quirks');
    expect(safe.startsWith('<!doctype html>')).toBe(true);
    expect(new ServerHTMLImporter().parse(safe, schema).toJSON()).toEqual(doc.toJSON());
    expect(importSource(safe).toJSON()).toEqual(doc.toJSON());
    expect(exportHTMLSource(doc, { document: false }).ok).toBe(false);
  });

  it('preserves envelope metadata through edits, replacement, history and reopening', () => {
    const doc = importSource('<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><p>Evidence</p>');
    const editor = new Editor(EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }));
    try {
      const before = editor.getJSON();
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Reviewed '));
      const edited = editor.getJSON();
      expect(editor.state.doc.attrs).toEqual(doc.attrs);
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(edited);
      const replacement = importSource('<!doctype html><p>Replacement</p>');
      editor.dispatch(editor.createTransaction().replaceDocument(replacement));
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(edited);
      const output = exportHTMLSource(editor.state.doc);
      expect(output.ok).toBe(true);
      if (output.ok) expect(importSource(output.sourceHTML).toJSON()).toEqual(edited);
    } finally { editor.destroy(); }
  });

  it.each([
    { version: 1, doctype: '<!doctype html><script>bad()</script>', mode: 'no-quirks' },
    { version: 1, doctype: '<!doctype html>', mode: 'quirks' },
    { version: 1, doctype: null, mode: 'no-quirks' },
    { version: 1, doctype: '<!doctype html>\0', mode: 'no-quirks' },
    { version: 1, doctype: '<!doctype html>', mode: 'no-quirks', extra: true },
  ])('refuses unverified declaration data without partial output: %j', htmlSourceEnvelope => {
    const doc = schema.node('doc', { htmlSourceEnvelope }, [schema.node('paragraph', {}, [schema.text('Visible')])]);
    const output = exportHTMLSource(doc);
    expect(output.ok).toBe(false);
    expect(output).not.toHaveProperty('sourceHTML');
    expect(doc.textContent).toBe('Visible');
  });

  it('keeps doctype-only caret content explicit rather than deleting it for conformance', () => {
    const doc = importSource('<!DOCTYPE html>');
    expect(doc.childCount).toBe(1); expect(doc.child(0).type.name).toBe('paragraph');
    const output = exportHTMLSource(doc);
    expect(output.ok).toBe(true);
    if (output.ok) expect(output.sourceHTML).toContain('<p></p>');
  });

  it('refuses oversized declarations and preserves ordinary import defaults', () => {
    expect(() => importSource(`<!DOCTYPE html PUBLIC "${'a'.repeat(2050)}"><p>Visible</p>`)).toThrow(/bounded envelope/);
    expect(new ServerHTMLImporter().parse('<!doctype html><p>Visible</p>', schema).attrs.htmlSourceEnvelope).toBeUndefined();
  });
});
