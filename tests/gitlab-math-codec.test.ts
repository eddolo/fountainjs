import { afterEach, expect, it } from 'vitest';
import { EditorState, Schema, createEditor, createHistoryPlugin, setMathSource, undo, redo, type Node } from 'fountainjs-editor';
import { GitLabMarkdownCodec, GitLabMarkdownConversionError, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import data from '../integrations/gitlab/fixtures/math-html.json';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
async function convert(markdown: string, html: string) {
  const schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: html }) });
  const { document } = await codec.deserialize({ schema, markdown, signal: new AbortController().signal });
  return { schema, codec, document };
}
function mathNodes(document: Node) {
  const result: Node[] = [];
  document.descendants(node => { if (['inline_math', 'math_block'].includes(node.type.name)) result.push(node); });
  return result;
}
const append = (doc: Node) => doc.copy([...doc.content, doc.type.schema.node('paragraph', {}, [doc.type.schema.text('Changed prose.')])]);

it.each(data.rows)('imports upstream $description and keeps math source after an unrelated edit', async row => {
  const { codec, document } = await convert(row.markdown, row.html);
  expect(codec.serialize({ doc: document })).toBe(row.markdown);
  const math = mathNodes(document);
  expect(math).toHaveLength(['prose with dollar amounts', 'inline code with a dollar'].includes(row.description) ? 0 : 1);
  const result = codec.serializeWithReport({ doc: append(document) });
  expect(result.issues).toEqual([]);
  expect(result.markdown).toContain('Changed prose.');
  if (math.length) {
    expect(math[0]!.attrs.latex).not.toContain('js-render-math');
    expect(result.markdown).toContain(row.markdown.match(/```math[\s\S]*```|\$`[\s\S]*?`\$|\$\$[\s\S]*?\$\$|\$[^$]*\$/u)![0]);
  }
  expect(globalThis.document).toBeUndefined();
});

it.each([
  ['legacy', '$`x^2`$', '<code data-math-style="inline">x^2</code>', '$`y_2`$'],
  ['dollar', '$x^2$', '<span data-math-style="inline">x^2</span>', '$y_2$'],
  ['display', '$$x^2$$', '<span data-math-style="display">x^2</span>', '$$y_2$$'],
])('edits native %s math with normal history while retaining the GitLab syntax', async (_syntax, source, html, expected) => {
  const { schema, codec, document } = await convert(source, `<p>${html}</p>`);
  const editor = createEditor({ schema: schema.spec, state: EditorState.create({ schema, doc: document, plugins: [createHistoryPlugin()] }) });
  cleanup.push(() => editor.destroy());
  expect(setMathSource(editor, 'y_2', undefined, [0, 0])).toBe(true);
  expect(codec.serialize({ doc: editor.state.doc })).toBe(expected);
  expect(undo(editor)).toBe(true);
  expect(codec.serialize({ doc: editor.state.doc })).toBe(source);
  expect(redo(editor)).toBe(true);
  expect(codec.serialize({ doc: editor.state.doc })).toBe(expected);
});

it('uses the actual GitLab digit-boundary fallback when edited inline dollar math precedes a digit', async () => {
  const { codec, document } = await convert('Energy $`E`$5', '<p>Energy <span data-math-style="inline">E</span>5</p>');
  expect(codec.serialize({ doc: append(document) })).toContain('Energy $`E`$5');
});

it('recovers original TeX from the pinned rendered KaTeX annotation instead of its visual glyphs', async () => {
  const { codec, document } = await convert('$`x^2`$', `<p>${data.katexHTML}</p>`);
  expect(mathNodes(document)[0]!.attrs.latex).toBe('x^2');
  expect(codec.serialize({ doc: append(document) })).toBe('$`x^2`$\n\nChanged prose.');
});

it.each([
  ['span', 'data-math-style="inline" class="js-render-math"', '$x^2$'],
  ['code', 'data-math-style="inline"', '$`x^2`$'],
  ['div', 'data-math-style="inline" class="math-content-inline"', '$x^2$'],
])('reads the retained annotation inside a rendered %s carrier, without concatenating glyph text', async (tag, attributes, syntax) => {
  const html = `<${tag} ${attributes}>${data.katexHTML}</${tag}>`;
  const { codec, document } = await convert(syntax, html);
  expect(mathNodes(document)[0]!.attrs.latex).toBe('x^2');
  expect(codec.serialize({ doc: append(document) })).toBe(syntax + '\n\nChanged prose.');
});

it.each([
  '<span class="katex">No retained annotation</span>',
  '<span class="katex" data-math-style="inline">Only glyphs</span>',
  '<span class="katex-error">Renderer error without original TeX</span>',
  '<span data-math-style="unknown">x</span>',
  '<code data-math-style="inline"></code>',
  '<span data-math-style="inline">' + 'x'.repeat(20_001) + '</span>',
])('reports malformed or unsupported math instead of flattening its text', async html => {
  await expect(convert('Retain original', `<p>${html}</p>`)).rejects.toMatchObject({
    originalMarkdown: 'Retain original', issues: [expect.objectContaining({ code: 'math-source' })],
  });
});

it('reports additional math semantics that ordinary GitLab syntax cannot retain', async () => {
  const { codec, document } = await convert('$x$', '<p><span data-math-style="inline">x</span></p>');
  const node = document.child(0).child(0).withAttrs({ ...document.child(0).child(0).attrs, ariaLabel: 'Important label' });
  const changed = document.copy([document.child(0).copy([node])]);
  expect(() => codec.serialize({ doc: changed })).toThrow(GitLabMarkdownConversionError);
  expect(codec.serializeWithReport({ doc: changed }).issues.some(issue => issue.code === 'math-metadata')).toBe(true);
});

it('retains a supplied accessible math description and reports its missing edited-export representation', async () => {
  const { codec, document } = await convert('$x$', '<p><span data-math-style="inline" aria-label="Important label">x</span></p>');
  expect(mathNodes(document)[0]!.attrs.ariaLabel).toBe('Important label');
  expect(codec.serialize({ doc: document })).toBe('$x$');
  expect(codec.serializeWithReport({ doc: append(document) }).issues.some(issue => issue.code === 'math-metadata')).toBe(true);
});

it.each([
  ['dollar', String.raw`\$5 + x`, false],
  ['dollar', String.raw`\\$5 + x`, true],
  ['dollar', 'x$y', true],
  ['display', 'x$y', false],
  ['display', 'x$$y', true],
  ['legacy', 'x`$y', true],
])('checks edited %s delimiter collisions without dropping source: %s', async (syntax, latex, collision) => {
  const { schema, codec } = await convert('', '<p></p>');
  const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.node('inline_math', { latex, gitlabMathSyntax: syntax })])]);
  expect(codec.serializeWithReport({ doc }).issues.some(issue => issue.code === 'math-delimiter')).toBe(collision);
});

it('uses a longer fence when edited block TeX contains backticks', async () => {
  const { schema, codec } = await convert('', '<p></p>');
  const doc = schema.node('doc', {}, [schema.node('math_block', { latex: 'a```b' })]);
  expect(codec.serialize({ doc })).toBe('````math\na```b\n````');
});

it('rejects non-string and block/inline-incompatible syntax attributes', () => {
  const schema = new Schema(createGitLabSchemaSpec());
  for (const value of [['dollar'], null, {}, 'fenced']) {
    expect(() => schema.node('inline_math', { latex: 'x', gitlabMathSyntax: value })).toThrow();
  }
  expect(() => schema.node('math_block', { latex: 'x', gitlabMathSyntax: 'dollar' })).toThrow();
});

it('keeps decoded HTML-looking TeX as source data instead of creating HTML nodes', async () => {
  const { document } = await convert('$x$', '<p><span data-math-style="inline">&lt;img src=x onerror=alert(1)&gt; &amp; &quot;text&quot;</span></p>');
  expect(mathNodes(document)[0]!.attrs.latex).toBe('<img src=x onerror=alert(1)> & "text"');
  const types: string[] = [];
  document.descendants(node => { types.push(node.type.name); });
  expect(types).not.toContain('inline_image');
});

it.each(['|x|', 'x\ny'])('reports source that could break a GitLab table rather than writing a broken table: %j', async latex => {
  const row = data.rows.find(row => row.description === 'math inside a table cell')!;
  const { codec, document } = await convert(row.markdown, row.html);
  const replace = (node: Node): Node => node.type.name === 'inline_math' ? node.withAttrs({ ...node.attrs, latex })
    : node.isText ? node : node.copy(node.content.map(replace));
  const changed = replace(document);
  expect(codec.serializeWithReport({ doc: changed }).issues.some(issue => issue.code === 'math-table-source')).toBe(true);
  expect(() => codec.serialize({ doc: changed })).toThrow(GitLabMarkdownConversionError);
});
