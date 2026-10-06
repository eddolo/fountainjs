// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, CoreSchemaSpec, HTMLImporter, HTMLExporter, MarkdownImporter, MarkdownExporter,
  HTMLContainerExtension, HTMLCommentExtension, HTMLFlowExtension, Editor, EditorState,
  Selection, createHistoryPlugin, insertText, undo, redo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  ...HTMLContainerExtension.nodes, ...HTMLCommentExtension.nodes, ...HTMLFlowExtension.nodes } });
const links = (doc: ReturnType<typeof ServerHTMLImporter.parse>) => {
  const values: string[] = [];
  doc.descendants(node => node.marks.forEach(mark => {
    if (mark.type.name === 'link') values.push(String(mark.attrs.href));
  }));
  return values;
};
const escaped = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
describe('literal control data in imported HTML link destinations', () => {
  it('renders model backslashes as data and restores their exact native spelling', () => {
    for (const href of ['foo\\bar', '/url\\bar*baz', 'https://example.com?find=\\*', 'https://example.com/\\[\\']) {
      const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [
        schema.text('Link', [schema.mark('link', { href })]),
      ])]);
      const html = HTMLExporter.export(doc, { document: false });
      const element = new DOMParser().parseFromString(html, 'text/html').querySelector('a')!;
      expect(element.getAttribute('href')).toBe(href.replaceAll('\\', '%5C'));
      expect(element.getAttribute('data-fountain-link-href')).toBe(href);
      expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
      expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
      const DOMSpec = schema.marks.link.spec.toDOM!(doc.content[0].content[0].marks[0]);
      expect(DOMSpec).toEqual(['a', expect.objectContaining({ href: href.replaceAll('\\', '%5C'), 'data-fountain-link-href': href }), 0]);
    }
  });

  it('never trusts an unsafe, oversized or destination-mismatched native carrier', () => {
    for (const carrier of ['javascript:alert(1)\\x', '//evil.test/\\x', 'different\\path', `a${'\\'.repeat(2_048)}`, 'safe']) {
      const html = `<p><a href="safe%5Cpath" data-fountain-link-href="${escaped(carrier)}">Link</a></p>`;
      const imported = new ServerHTMLImporter().parseWithReport(html, schema);
      expect(links(imported.document)).toEqual(['safe%5Cpath']);
      expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(imported.document.toJSON());
      expect(imported.issues).toContainEqual(expect.objectContaining({ code: 'invalid-rule-result', contribution: 'mark:link' }));
      expect(imported.issues.every(issue => !issue.message.includes(carrier))).toBe(true);
    }
  });

  it('does not turn an HTTP authority backslash into a different hostname', () => {
    const href = 'https://safe.test\\@evil.test/path';
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Link', [schema.mark('link', { href })])])]);
    const html = HTMLExporter.export(doc, { document: false });
    const element = new DOMParser().parseFromString(html, 'text/html').querySelector('a')!;
    expect(element.getAttribute('href')).toBe(href);
    expect(new URL(element.href).hostname).toBe('safe.test');
    expect(element.hasAttribute('data-fountain-link-href')).toBe(false);
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each([
    ['foo  \nbar', 'foo  %0Abar'], ['foo\\\nbar', 'foo%5C%0Abar'],
    ['/folder/\tname', '/folder/%09name'], ['#note\rpart', '#note%0Apart'],
    ['https://example.test/path?q=a\nb', 'https://example.test/path?q=a%0Ab'],
  ])('preserves %j as encoded data without storing controls', (href, expected) => {
    const source = `<p>Before <a href="${escaped(href)}">destination</a> after.</p>`;
    const imported = new ServerHTMLImporter().parseWithReport(source, schema);
    expect(links(imported.document)).toEqual([expected]);
    expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(imported.document.toJSON());
    expect(imported.issues).toContainEqual(expect.objectContaining({ code: 'normalized-link-url' }));
    expect(imported.issues.every(issue => !issue.message.includes(href))).toBe(true);
    const html = HTMLExporter.export(imported.document, { document: false });
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(imported.document.toJSON());
    const canonical = MarkdownExporter.export(imported.document);
    const reopened = MarkdownImporter.parse(canonical, schema, { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow });
    expect(reopened.toJSON()).toEqual(imported.document.toJSON());
    expect(links(reopened)).toEqual([expected]);
  });

  it.each(['\n', '\r\n'])('retains unclosed empty link boundaries through Markdown flow %j', ending => {
    for (const href of ['foo  \nbar', 'foo\\\nbar']) {
      const source = `<a href="${href}">\n`.replaceAll('\n', ending);
      const importer = new ServerHTMLImporter();
      const captured = MarkdownImporter.parseWithSource(source, schema, {
        parseHTMLDocument: importer.parseTextBlockFlow.bind(importer),
      });
      const expected = href.replaceAll('\\', '%5C').replaceAll('\n', '%0A');
      expect(links(captured.document)).toEqual([expected, expected]);
      expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
      const native = captured.document.toJSON();
      const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
      expect(insertText(editor, 'label')).toBe(true);
      const edited = editor.getJSON();
      undo(editor); expect(editor.getJSON()).toEqual(native);
      redo(editor); expect(editor.getJSON()).toEqual(edited);
      const html = HTMLExporter.export(editor.state.doc, { document: false });
      expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(edited);
      editor.destroy();
    }
  });

  it('distinguishes a character-reference CR from HTML literal newline normalization', () => {
    const source = '<p><a href="#note&#13;part">label</a></p>';
    const doc = ServerHTMLImporter.parse(source, schema);
    expect(links(doc)).toEqual(['#note%0Dpart']);
    expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(doc.toJSON());
  });

  it('still rejects unsafe schemes, network paths, other controls and broken authorities', () => {
    const rejected = ['javascript:alert(1)', '//evil.test/path', '\\evil.test', '/\\evil.test',
      'custom:payload', 'mailto:a\nb@example.test', 'https://exa\nmple.test/path',
      'https://safe.test\\@evil.test/path\n', 'https://safe.test\n/path', 'x\u0001y', 'x\u007fy'];
    for (const base of ['javascript:alert(1)', 'vbscript:payload', 'data:text/html,bad', '//evil.test/path', '\\evil.test']) {
      for (const control of ['\t', '\n', '\r']) for (let at = 0; at <= base.length; at++) {
        rejected.push(base.slice(0, at) + control + base.slice(at));
      }
    }
    for (const href of rejected) {
      const source = `<p><a href="${escaped(href)}">visible</a></p>`;
      const imported = new ServerHTMLImporter().parseWithReport(source, schema);
      expect(links(imported.document), JSON.stringify(href)).toEqual([]);
      expect(links(HTMLImporter.parse(source, schema)), JSON.stringify(href)).toEqual([]);
      expect(imported.document.textContent).toBe('visible');
      expect(imported.issues).toContainEqual(expect.objectContaining({ code: 'rejected-url' }));
    }
  });

  it('does not reinterpret existing safe URLs or controls in labels', () => {
    for (const href of ['', '/relative', '#note', 'https://example.test/a%0Ab', 'mailto:a@example.test']) {
      const source = `<p><a href="${href}">literal\nlabel</a></p>`;
      const result = new ServerHTMLImporter().parseWithReport(source, schema);
      expect(links(result.document)).toEqual([href]);
      expect(result.document.textContent).toBe('literal\nlabel');
      expect(result.issues.filter(issue => issue.code === 'normalized-link-url')).toEqual([]);
    }
  });

  it('reports encoded expansion that cannot fit the declared link schema', () => {
    const source = `<p><a href="folder/${'\t'.repeat(700)}">visible</a></p>`;
    const result = new ServerHTMLImporter().parseWithReport(source, schema);
    expect(links(result.document)).toEqual([]);
    expect(result.document.textContent).toBe('visible');
    expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(result.document.toJSON());
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid-rule-result', contribution: 'mark:link' }));
    expect(result.issues.some(issue => issue.code === 'normalized-link-url')).toBe(false);
  });

  it('keeps the exact native-boundary difference from rejected HTML visible', () => {
    const source = '<p><a href="folder\\\nreport">destination</a></p><p><a href="java&#10;script:bad">Blocked unsafe link</a> remains readable.</p>';
    const result = new ServerHTMLImporter().parseWithReport(source, schema);
    const native = result.document.toJSON();
    expect(native.content![1].content).toEqual([
      { type: 'text', text: 'Blocked unsafe link' }, { type: 'text', text: ' remains readable.' },
    ]);
    const expected = { ...native, content: [native.content![0], { ...native.content![1],
      content: [{ type: 'text', text: 'Blocked unsafe link remains readable.' }] }] };
    const reopened = MarkdownImporter.parse(MarkdownExporter.export(result.document), schema, { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow });
    expect(reopened.toJSON()).toEqual(expected);
    expect(reopened.toJSON()).not.toEqual(native);
    expect(schema.nodeFromJSON(native).toJSON()).toEqual(native);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'rejected-url' }));
  });
});
