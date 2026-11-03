// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parse } from 'parse5';
import { Schema, MarkdownImporter, MarkdownExporter, HTMLExporter, Editor, EditorState, createHistoryPlugin, undo, redo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { createHTMLSourceEOFExtension } from '../src/html/inert';
import { unfinishedHTMLTail } from '../src/html/eof';
import { createHTMLSourceMarkdownAdapter, importHTMLSourceDocument, exportHTMLSource } from '../src/html/source';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...createHTMLSourceEOFExtension().nodes } });
const options = { parseHTMLDocument: createHTMLSourceMarkdownAdapter() };
const eofNodes = (doc: import('../src/headless').Node) => doc.content.filter(node => node.type.name === 'html_source_eof');
describe('explicit unfinished tag source at EOF', () => {
  it.each(['<div id="foo"\n*hi*\n', '<div class\nfoo\n', '<div *???-&&&-<---\n*foo*\n'])('retains the official empty-tree EOF patterns and exact source: %j', raw => {
    for (const source of [raw, raw.replaceAll('\n', '\r\n')]) {
      const captured = MarkdownImporter.parseWithSource(source, schema, options);
      expect(captured.document.childCount).toBe(1); expect(eofNodes(captured.document)).toHaveLength(1);
      expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
      const tail = eofNodes(captured.document)[0].textContent;
      const result = exportHTMLSource(captured.document);
      expect(result.ok, JSON.stringify(result.issues)).toBe(true);
      if (!result.ok) continue;
      expect(result.sourceHTML.endsWith(tail)).toBe(true);
      const parsed = parse(result.sourceHTML);
      const html = parsed.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as any;
      expect(html.childNodes.find((node: any) => node.tagName === 'body').childNodes).toEqual([]);
      expect(eofNodes(importHTMLSourceDocument(result.sourceHTML, schema).document)[0].textContent).toBe(tail);
      expect(new ServerHTMLImporter().parse(HTMLExporter.export(captured.document), schema).toJSON()).toEqual(captured.document.toJSON());
    }
  });

  it.each([
    ['<div>Visible <em>marked</em><a title="<nested', '<a title="<nested'],
    ['<!doctype html><html><head></head><body><p>Visible</p><div data-x="<nested', '<div data-x="<nested'],
    ['Before &amp; after <div title="unfinished', '<div title="unfinished'],
    ['<template><p>Inside</p></template><div data-x=', '<div data-x='],
  ])('uses lexical source locations rather than the last angle bracket: %j', (source, tail) => {
    expect(unfinishedHTMLTail(source)?.tail).toBe(tail);
  });

  it('retains a parsed Markdown prefix and refuses data after a moved EOF node', () => {
    const raw = 'Before **evidence**.\n\n<div title="<unfinished\n';
    const captured = MarkdownImporter.parseWithSource(raw, schema, options);
    expect(captured.document.child(0).textContent).toBe('Before evidence.');
    expect(eofNodes(captured.document)).toHaveLength(1);
    const output = exportHTMLSource(captured.document); expect(output.ok, JSON.stringify(output.issues)).toBe(true);
    const eof = eofNodes(captured.document)[0];
    const moved = captured.document.copy([eof, captured.document.child(0)]);
    expect(exportHTMLSource(moved).ok).toBe(false);
    expect(exportHTMLSource(captured.document.copy([eof, eof])).ok).toBe(false);
  });

  it('retains current literal edits, history, JSON and safe HTML without activating source', () => {
    const document = MarkdownImporter.parse('<div onclick="unfinished', schema, options);
    const editor = new Editor(EditorState.create({ schema, doc: document, plugins: [createHistoryPlugin()] }));
    try {
      const before = editor.getJSON();
      editor.dispatch(editor.createTransaction().insertText([0, 0], document.textContent.length, '\nmore <raw'));
      const edited = editor.getJSON();
      const result = exportHTMLSource(editor.state.doc); expect(result.ok).toBe(true);
      if (result.ok) expect(result.sourceHTML.endsWith('\nmore <raw')).toBe(true);
      expect(schema.nodeFromJSON(edited).toJSON()).toEqual(edited);
      expect(new ServerHTMLImporter().parse(HTMLExporter.export(editor.state.doc), schema).toJSON()).toEqual(edited);
      expect(MarkdownImporter.parse(MarkdownExporter.export(editor.state.doc), schema, options).toJSON()).toEqual(edited);
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(edited);
      expect(HTMLExporter.export(editor.state.doc)).not.toContain('<div onclick=');
    } finally { editor.destroy(); }
  });

  it.each(['<div>Completed</div>', 'Plain text', '<div\0', '<div\ud800'])('refuses completed, retyped or invalid source: %j', text => {
    const node = schema.node('html_source_eof', {}, [schema.text(text)]);
    const doc = schema.node('doc', {}, [node]);
    const result = exportHTMLSource(doc); expect(result.ok).toBe(false); expect(result).not.toHaveProperty('sourceHTML');
  });

  it('preserves direct complete-document EOF source and envelope', () => {
    const raw = '<!doctype html><html><head></head><body><p>Evidence</p><div data-x="unfinished';
    const doc = importHTMLSourceDocument(raw, schema).document;
    expect(eofNodes(doc)).toHaveLength(1); expect(doc.child(0).textContent).toBe('Evidence');
    const result = exportHTMLSource(doc); expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    if (result.ok) expect(importHTMLSourceDocument(result.sourceHTML, schema).document.toJSON()).toEqual(doc.toJSON());
  });

  it('keeps byte limits and the default literal fallback', () => {
    const standard = new Schema(CoreSchemaSpec);
    expect(eofNodes(MarkdownImporter.parse('<div class\nvalue', standard, options))).toHaveLength(0);
    const issues: unknown[] = [];
    const doc = MarkdownImporter.parse('<div class="😀😀😀😀', schema, {
      parseHTMLDocument: createHTMLSourceMarkdownAdapter({ maxInputBytes: 20 }), onHTMLFlowFallback: issue => issues.push(issue),
    });
    expect(eofNodes(doc)).toHaveLength(0); expect(doc.textContent).toContain('😀'); expect(issues.length).toBeGreaterThan(0);
  });

  it('retains a new raw EOF tail even when the input carries a safe-reader envelope', () => {
    const base = importHTMLSourceDocument('<!doctype html><p>Evidence</p>', schema).document;
    const source = HTMLExporter.export(base) + '<div title="unfinished';
    const doc = importHTMLSourceDocument(source, schema).document;
    expect(doc.attrs.htmlSourceEnvelope).toEqual(base.attrs.htmlSourceEnvelope);
    expect(eofNodes(doc)[0].textContent).toBe('<div title="unfinished');
  });

  it('preserves direct HTML tail CR/CRLF and literal Unicode through safe carriers', () => {
    const raw = '<div title="😀\r\nnext\rzero\u200b';
    const doc = importHTMLSourceDocument(raw, schema).document;
    expect(eofNodes(doc)[0].textContent).toBe(raw);
    expect(new ServerHTMLImporter().parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    const output = exportHTMLSource(doc); expect(output.ok).toBe(true);
    if (output.ok) expect(output.sourceHTML.endsWith(raw)).toBe(true);
  });

  it('rejects oversized EOF data and altered carrier descendants', () => {
    expect(() => schema.node('html_source_eof', {}, [schema.text('<div title="' + 'x'.repeat(65_536))])).toThrow();
    const doc = MarkdownImporter.parse('<div class=', schema, options);
    const html = HTMLExporter.export(doc).replace('<code>', '<code><strong>Changed</strong>');
    const reopened = new ServerHTMLImporter().parse(html, schema);
    expect(eofNodes(reopened)).toHaveLength(0); expect(reopened.textContent).toContain('Changed');
  });

  it('refuses direct HTML source import beyond capture limits even after the diagnostic budget is exhausted', () => {
    const raw = '<p a="1" a="2">Evidence</p><div title="' + 'x'.repeat(65_537);
    expect(() => importHTMLSourceDocument(raw, schema, { maxParseErrors: 1 })).toThrow(/could not be retained/);
  });
});
