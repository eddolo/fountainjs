import { describe, expect, it } from 'vitest';
import { Schema, Editor, EditorState, createHistoryPlugin, undo, redo, MarkdownImporter, MarkdownExporter, HTMLExporter } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import type { HTMLParseElement, HTMLSourceTokens, NodeSpec } from '../src/core/schema';
import { ServerHTMLImporter } from '../src/html/server';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

function fixture() {
  const observed: Array<{ tag: string; tokens: HTMLSourceTokens | null }> = [];
  const extract = (element: HTMLParseElement) => {
    const tokens = element.getSourceTokens?.() ?? null;
    observed.push({ tag: element.tagName, tokens });
    return { tokens };
  };
  const inline: NodeSpec = {
    inline: true, group: 'inline', content: 'inline*', markdown: 'html',
    attrs: { tokens: { default: null } },
    parseHTML: [
      { tag: 'span[data-source-tokens]', getAttrs: element => ({ tokens: JSON.parse(element.getAttribute('data-source-tokens')!) }) },
      { tag: 'foo,bar,fountain-unsafe', getAttrs: extract },
    ],
    toDOM: node => ['span', { 'data-source-tokens': JSON.stringify(node.attrs.tokens) }, 0],
  };
  const section: NodeSpec = { group: 'block', content: 'inline*',
    parseHTML: [{ tag: 'section', getAttrs: extract, contentElement: 'div.content' }],
    attrs: { tokens: { default: null } }, toDOM: () => ['section', 0] };
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, source_inline: inline, source_section: section } });
  return { schema, observed };
}

const cases = [
  ["<p>😀Before <FoO z='&amp;' A=unquoted>inside</FOO> after</p>", "<FoO z='&amp;' A=unquoted>", '</FOO>'],
  ['<p><foo data-v="x>y"\r\n boolean>\ntext</foo></p>', '<foo data-v="x>y"\r\n boolean>', '</foo>'],
  ['<p>before <foo>unclosed', '<foo>', null],
  ['<p><foo/>tail</p>', '<foo/>', null],
  ['<p><foo><bar a="nested">inside</bar></foo></p>', '<foo>', '</foo>'],
  ['<p><fountain-unsafe onclick="evil()" style="background:url(https://invalid.test/x)">text</fountain-unsafe></p>', '<fountain-unsafe onclick="evil()" style="background:url(https://invalid.test/x)">', '</fountain-unsafe>'],
] as const;

describe('opt-in parser-input source tokens', () => {
  for (const fragment of [false, true]) it.each(cases)(`retains exact raw HTML tokens (${fragment ? 'fragment' : 'document'}): %s`, (html, startTag, endTag) => {
    expect(typeof document).toBe('undefined');
    const { schema, observed } = fixture();
    const importer = new ServerHTMLImporter({ sourceTokens: true });
    const nodes = fragment ? importer.parseFragment(html, schema) : importer.parse(html, schema).content;
    expect(observed[0]?.tokens).toEqual({ startTag, endTag, origin: 'html-input' });
    expect(Object.isFrozen(observed[0]?.tokens)).toBe(true);
    expect(() => Reflect.set(observed[0]!.tokens!, 'startTag', 'corrupted')).not.toThrow();
    expect(observed[0]?.tokens?.startTag).toBe(startTag);
    for (const node of nodes) schema.validate(node);
    const doc = schema.topNodeType.create({}, nodes);
    const exported = HTMLExporter.export(doc, { document: false });
    // Inspect real parsed attributes, not words inside an encoded data string.
    // Those words must remain preserved even when they describe hostile input.
    const inspect = (node: DefaultTreeAdapterMap['node']): void => {
      if ('attrs' in node) {
        expect(['foo', 'bar', 'fountain-unsafe']).not.toContain(node.tagName);
        expect(node.attrs.some(attr => /^on/iu.test(attr.name) || attr.name === 'style')).toBe(false);
      }
      if ('childNodes' in node) node.childNodes.forEach(inspect);
    };
    inspect(parseFragment(exported));
    expect(importer.parse(exported, schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each([undefined, false])('does not collect lexemes by default or when disabled: %j', sourceTokens => {
    const { schema, observed } = fixture();
    new ServerHTMLImporter({ sourceTokens }).parse('<p><FoO A=one>text</FOO></p>', schema);
    expect(observed[0]?.tokens).toBeNull();
  });

  it.each(['yes', 1, null, {}, []])('refuses invalid source-retention options: %j', value => {
    expect(() => new ServerHTMLImporter({ sourceTokens: value as boolean })).toThrow(/sourceTokens/u);
  });

  it('preserves source context through nested content selectors and independent imports', () => {
    const { schema, observed } = fixture();
    const importer = new ServerHTMLImporter({ sourceTokens: true });
    for (let index = 0; index < 40; index++) {
      observed.length = 0;
      importer.parse(`<section><div class="content"><FOO a='${index}'>inside</FOO></div></section>`, schema);
      expect(observed.find(item => item.tag === 'foo')?.tokens).toEqual({ startTag: `<FOO a='${index}'>`, endTag: '</FOO>', origin: 'html-input' });
      expect(observed.find(item => item.tag === 'section')?.tokens).toEqual({ startTag: '<section>', endTag: '</section>', origin: 'html-input' });
    }
  });

  it('distinguishes reconstructed Markdown input from original file coordinates', () => {
    const { schema, observed } = fixture();
    const importer = new ServerHTMLImporter({ sourceTokens: true });
    const source = "Before <FoO A='&amp;'>**inside**</FOO> after.\n";
    const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };
    const captured = MarkdownImporter.parseWithSource(source, schema, options);
    const tokens = observed.find(item => item.tag === 'foo')?.tokens;
    expect(tokens).toEqual({ startTag: "<FoO A='&amp;'>", endTag: '</FOO>', origin: 'markdown-projection' });
    expect(tokens).not.toHaveProperty('startOffset');
    expect(tokens).not.toHaveProperty('endOffset');
    const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
    try {
      let path: number[] = [];
      editor.state.doc.descendants((node, candidate) => { if (node.isText && node.text === 'inside') path = [...candidate]; });
      expect(path.length).toBeGreaterThan(0);
      editor.dispatch(editor.createTransaction().insertText(path, 6, ' revised'));
      const current = editor.getJSON();
      const exported = MarkdownExporter.exportWithSource(editor.state.doc, captured.source);
      expect(MarkdownImporter.parse(exported.markdown, schema, options).toJSON()).toEqual(current);
      expect(undo(editor)).toBe(true);
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      expect(redo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(current);
    } finally { editor.destroy(); }
  });

  it('returns no invented source for implied elements', () => {
    const results: Array<HTMLSourceTokens | null> = [];
    const schema = new Schema({ ...CoreSchemaSpec, marks: { ...CoreSchemaSpec.marks,
      source_probe: { parseHTML: [{ tag: 'tbody', getAttrs: el => { results.push(el.getSourceTokens?.() ?? null); return false; } }], toDOM: () => ['span', 0] },
    } });
    new ServerHTMLImporter({ sourceTokens: true }).parse('<table><tr><td>value</td></tr></table>', schema);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result === null)).toBe(true);
    results.length = 0;
    new ServerHTMLImporter({ sourceTokens: true }).parse("<table><TBODY data-original='yes'><tr><td>value</td></tr></TBODY></table>", schema);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result?.startTag === "<TBODY data-original='yes'>" && result.endTag === '</TBODY>' && result.origin === 'html-input')).toBe(true);
  });
});
