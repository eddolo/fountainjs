// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Schema, MarkdownImporter, MarkdownExporter, HTMLExporter, Editor, EditorState, createHistoryPlugin, undo, redo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { createHTMLSourceMarkdownAdapter, exportHTMLSource, importHTMLSourceDocument } from '../src/html/source';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const options = { parseHTMLDocument: createHTMLSourceMarkdownAdapter() };
describe('Markdown document projection attributes and declaration data', () => {
  it.each(['\n', '\r\n'])('retains a leading declaration through source, editing and reopening: %j', ending => {
    const declaration = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">';
    const source = [declaration, '', 'Research evidence.', ''].join(ending);
    const captured = MarkdownImporter.parseWithSource(source, schema, options);
    expect(captured.document.attrs.htmlSourceEnvelope).toEqual({ version: 1, doctype: declaration, mode: 'quirks' });
    expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
    const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
    try {
      const before = editor.getJSON();
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Reviewed '));
      const after = editor.getJSON();
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
      expect(schema.nodeFromJSON(after).toJSON()).toEqual(after);
      expect(new ServerHTMLImporter().parse(HTMLExporter.export(editor.state.doc), schema).toJSON()).toEqual(after);
      const output = exportHTMLSource(editor.state.doc);
      expect(output.ok).toBe(true);
      if (output.ok) expect(importHTMLSourceDocument(output.sourceHTML, schema).document.toJSON()).toEqual(after);
    } finally { editor.destroy(); }
  });

  it('retains the doctype-only editing paragraph explicitly', () => {
    const doc = MarkdownImporter.parse('<!DOCTYPE html>\n', schema, options);
    expect(doc.attrs.htmlSourceEnvelope).toEqual({ version: 1, doctype: '<!DOCTYPE html>', mode: 'no-quirks' });
    expect(doc.child(0).type.name).toBe('paragraph');
    const result = exportHTMLSource(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sourceHTML).toContain('<p></p>');
  });

  it('does not invent envelope data for plain Markdown, inline HTML or late declarations', () => {
    for (const source of ['Normal **text**.', '<p>HTML</p>', 'Before\n\n<!DOCTYPE html>']) {
      const doc = MarkdownImporter.parse(source, schema, options);
      expect(doc.attrs.htmlSourceEnvelope).toBeUndefined();
    }
  });

  it('keeps array-returning adapters compatible and commits structured metadata', () => {
    const node = schema.node('paragraph', {}, [schema.text('Projected')]);
    expect(MarkdownImporter.parse('<div>source</div>', schema, { parseHTMLDocument: () => [node] }).child(0)).toBe(node);
    const supplied = { title: 'Document', nested: { owner: 'Ada' } };
    const captured = MarkdownImporter.parseWithSource('<div>source</div>', schema,
      { parseHTMLDocument: () => ({ nodes: [node], attributes: supplied }) });
    supplied.nested.owner = 'Grace';
    expect(captured.document.attrs.nested).toEqual({ owner: 'Ada' });
    expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe('<div>source</div>');
  });

  it.each([null, [], 'invalid', { nodes: 'invalid' }, { nodes: [], attributes: [] }])('handles declined, empty and invalid projections atomically: %j', result => {
    const issues: unknown[] = [];
    const source = '<div>Keep source</div>';
    const plain = MarkdownImporter.parse(source, schema);
    const doc = MarkdownImporter.parse(source, schema, {
      parseHTMLDocument: () => result as any, onHTMLFlowFallback: issue => issues.push(issue),
    });
    // [] is the supported legacy empty result, not malformed.
    if (Array.isArray(result)) expect(doc.child(0).textContent).toBe('');
    else { expect(doc.toJSON()).toEqual(plain.toJSON()); expect(issues).toHaveLength(1); }
  });

  it('rejects invalid root attributes without committing converted blocks', () => {
    const target = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      doc: { ...CoreSchemaSpec.nodes.doc, attrs: { revision: { default: 1, validate: value => Number.isInteger(value) } } } } });
    const issues: unknown[] = [];
    const doc = MarkdownImporter.parse('<div>Keep source</div>', target, {
      parseHTMLDocument: () => ({ nodes: [target.node('paragraph', {}, [target.text('Discard this projection')])], attributes: { revision: 'invalid' } }),
      onHTMLFlowFallback: issue => issues.push(issue),
    });
    expect(doc.textContent).toContain('Keep source'); expect(doc.attrs.revision).toBe(1); expect(issues).toHaveLength(1);
  });

  it('retains the existing explicit unfinished-token refusal', () => {
    const issues: unknown[] = [];
    const source = '<div class\nfoo\n';
    const parsed = MarkdownImporter.parseWithSource(source, schema, { ...options, onHTMLFlowFallback: issue => issues.push(issue) });
    expect(parsed.document.textContent).toContain('<div class');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    expect(issues.length).toBeGreaterThan(0);
  });
});
