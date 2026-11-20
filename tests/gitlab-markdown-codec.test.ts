import { expect, it, vi } from 'vitest';
import { Schema, type Node } from 'fountainjs-editor';
import { GitLabMarkdownCodec, GitLabMarkdownConversionError, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import data from '../integrations/gitlab/fixtures/service-html.json';
import mergedPreviews from '../integrations/gitlab/fixtures/merged-grid-live-html.json';
import emojiPreviews from '../integrations/gitlab/fixtures/clipboard-unicode-live-html.json';

async function convert(markdown: string, body: string, preserveWikiSource = false) {
  const schema = new Schema(createGitLabSchemaSpec());
  const render = vi.fn(async () => ({ body }));
  const codec = new GitLabMarkdownCodec({ renderMarkdown: render, preserveWikiSource });
  const { document } = await codec.deserialize({ schema, markdown, signal: new AbortController().signal });
  return { schema, codec, document, render };
}
const append = (document: Node): Node => document.copy([...document.content,
  document.type.schema.node('paragraph', {}, [document.type.schema.text('Added.')])]);

it.each(mergedPreviews.fixtures)('keeps $name through canonical GitLab Save while ordinary tables stay in Markdown',async ({name,source,body})=>{
  const {codec,document}=await convert(source,body);
  expect(codec.serialize({doc:document})).toBe(source);
  const output=codec.serializeWithReport({doc:append(document)});
  expect(output.issues).toEqual([]);
  expect(output.markdown).toContain(name+'="2"');
  expect(output.markdown).toContain('<strong>bold</strong>');
  expect(output.markdown).toContain('| T1 | T2 |');
  expect(output.markdown).toContain('Added.');
});

it('retains the author’s Markdown spelling on an unchanged paragraph when an adjacent block is inserted', async () => {
  const source = '# Review schedule\r\n\r\nOwner: __Release team__.\r\n\r\nStatus: pending.';
  const html = '<h1 dir="auto">Review schedule</h1><p dir="auto">Owner: <strong>Release team</strong>.</p><p dir="auto">Status: pending.</p>';
  const { schema, codec, document } = await convert(source, html, true);
  const text = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);
  const changed = document.copy([document.child(0), document.child(1), text('Schedule the review.'), text('Status: pending. Assigned.')]);
  expect(codec.serializeWithReport({doc:changed, canonical:true}).markdown).toContain('**Release team**');
  expect(codec.serialize({doc:changed}).replaceAll('\r\n','\n')).toBe(
    '# Review schedule\n\nOwner: __Release team__.\n\nSchedule the review.\n\nStatus: pending. Assigned.');
});

it('saves the separate paragraphs left in a header after a merge and split', async () => {
  const { schema, codec, document } = await convert('Title', '<p>Title</p>');
  const paragraph = (value: string) => schema.node('paragraph', {}, value ? [schema.text(value)] : []);
  const table = schema.node('table', {}, [schema.node('table_row', {}, [
    schema.node('table_header', {}, [paragraph('Work'), paragraph('Owner')]),
    schema.node('table_header', {}, [paragraph('')]),
  ])]);
  const doc = document.copy([...document.content, table]);
  const markdown = codec.serialize({ doc });
  expect(markdown).toContain('<table');
  const restored = await convert(markdown, markdown.slice(markdown.indexOf('<table')));
  expect(restored.document.child(0).toJSON()).toEqual(table.toJSON());
});

it('reports stored column widths in a merged table instead of losing them during Save', async () => {
  const sample = mergedPreviews.fixtures[0]!;
  const { codec, document } = await convert(sample.source, sample.body);
  const table = document.child(1), row = table.child(1), merged = row.child(0);
  const resized = merged.type.create({ ...merged.attrs, colwidth: [100, 120] }, merged.content);
  const updated = table.copy([table.child(0), row.copy([resized, ...row.content.slice(1)]), ...table.content.slice(2)]);
  const doc = document.copy([document.child(0), updated, ...document.content.slice(2)]);
  expect(codec.serializeWithReport({ doc }).issues).toContainEqual(expect.objectContaining({ code: 'attribute:table_cell' }));
  expect(() => codec.serialize({ doc })).toThrow(GitLabMarkdownConversionError);
});

it.each(emojiPreviews.fixtures)('opens the project preview for $name and preserves its exact unedited source',async ({source,body})=>{
  const {codec,document}=await convert(source,body);
  expect(document.textContent).toContain('cafe\u0301 and 👩🏽‍💻');
  expect(codec.serialize({doc:document})).toBe(source);
  const edited=codec.serializeWithReport({doc:append(document)});
  expect(edited.issues).toEqual([]);
  expect(edited.markdown).toBe(source+'\n\nAdded.');
});

it('preserves GitLab-specific spelling when the local wiki parser would read a different tree', async () => {
  const sample = emojiPreviews.fixtures.find(item => item.name === 'stock-emoji-shortcode')!;
  const {codec,document} = await convert(sample.source, sample.body, true);
  const edited = codec.serializeWithReport({doc:append(document)});
  expect(edited.preservation).toBe('canonical');
  expect(edited.markdown).toBe(sample.source + '\n\nAdded.');
});

it('keeps new literal emoji distinct from an existing GitLab shortcode',async()=>{
  const sample=emojiPreviews.fixtures.find(item=>item.name==='stock-emoji-shortcode')!;
  const {codec,document,schema}=await convert(sample.source,sample.body);
  const updated=document.copy([...document.content,schema.node('paragraph',{},[schema.text('New 👩🏽‍💻')])]);
  expect(codec.serialize({doc:updated})).toBe(sample.source+'\n\nNew 👩🏽‍💻');
});
it('retains source for an unfamiliar nested GitLab emoji renderer',async()=>{
  const sample=emojiPreviews.fixtures[0]!;
  await expect(convert(sample.source,sample.body.replace('👩🏽‍💻</gl-emoji>','<b>label</b></gl-emoji>')))
    .rejects.toMatchObject({originalMarkdown:sample.source});
});

it('preserves exact source while displaying resolved references and retains original tokens after another edit', async () => {
  const source = 'See #1 and !1 by @root with ~bug in b51c8ef20575\r\n';
  const { codec, document } = await convert(source, data.fixtures.RESOLVED_REFERENCES_PARAGRAPH_HTML);
  const references: Node[] = [];
  document.descendants(node => { if (node.type.name === 'gitlab_reference') references.push(node); });
  expect(references).toHaveLength(5);
  expect(references.map(node => node.attrs.original)).toEqual(['#1', '!1', '@root', '~bug', 'b51c8ef20575']);
  expect(references.at(-1)!.attrs.label).toBe('b51c8ef2');
  expect(references[3]!.attrs.color).toBe('#6699cc');
  expect(codec.serializeWithReport({ doc: document })).toEqual({ markdown: source, preservation: 'exact', issues: [] });
  const output = codec.serializeWithReport({ doc: append(document) });
  expect(output.issues).toEqual([]);
  expect(output.preservation).toBe('canonical');
  expect(output.markdown).toBe(source.trim() + '\n\nAdded.');
  expect(typeof globalThis.document).toBe('undefined');
});

it.each([
  ['repository image', '![logo](app/assets/images/logo.svg)', data.fixtures.REPOSITORY_RELATIVE_IMAGE_HTML, 'app/assets/images/logo.svg'],
  ['repository link', '[readme](README.md)', data.fixtures.REPOSITORY_RELATIVE_LINK_HTML, 'README.md'],
  ['titled repository link', '[readme](README.md "the *title*")', data.fixtures.REPOSITORY_RELATIVE_LINK_WITH_TITLE_HTML, 'README.md'],
  ['linked image', '[![logo](app/assets/images/logo.svg)](https://gitlab.com)', data.fixtures.REPOSITORY_RELATIVE_LINKED_IMAGE_HTML, 'app/assets/images/logo.svg'],
  ['uploaded image', '![up](/uploads/0123456789abcdef0123456789abcdef/x.png)', data.fixtures.UPLOAD_IMAGE_HTML, '/uploads/0123456789abcdef0123456789abcdef/x.png'],
  ['proxied image', '![abs](https://example.com/a.png)', data.fixtures.ASSET_PROXIED_IMAGE_HTML, 'https://example.com/a.png'],
  ['mixed paragraph', 'Read [the readme](README.md) and ![logo](app/assets/images/logo.svg) here', data.fixtures.REPOSITORY_RELATIVE_MIXED_PARAGRAPH_HTML, 'README.md'],
  ['nested images', '* item one\n* item with ![logo](app/assets/images/logo.svg) inline\n  * nested ![logo](app/assets/images/logo.svg)', data.fixtures.REPOSITORY_RELATIVE_IMAGE_IN_LIST_HTML, 'app/assets/images/logo.svg'],
  ['table image', '| a | b |\n|---|---|\n| ![logo](app/assets/images/logo.svg) | text |', data.fixtures.REPOSITORY_RELATIVE_IMAGE_IN_TABLE_HTML, 'app/assets/images/logo.svg'],
])('retains the %s canonical address through an edited document', async (_kind, source, html, destination) => {
  const { codec, document } = await convert(source, html);
  expect(codec.serialize({ doc: document })).toBe(source);
  const result = codec.serializeWithReport({ doc: append(document) });
  expect(result.issues).toEqual([]);
  expect(result.markdown).toContain(destination);
  expect(result.markdown).toContain('Added.');
  expect(result.markdown).not.toContain('data:image/gif');
  expect(result.markdown).not.toContain('user-content.gitlab-static.net');
  expect(result.markdown).not.toContain('/-/raw/master/');
});

it('does not serialize an issue URL link as a raw reference or add the generated issue title', async () => {
  const source = '[the issue](https://gitlab.com/gitlab-org/gitlab/-/issues/1)';
  const { codec, document } = await convert(source, data.fixtures.LINK_REFERENCE_HTML);
  expect(document.child(0).child(0).type.name).toBe('text');
  expect(codec.serialize({ doc: append(document) })).toBe(source + '\n\nAdded.');
});

it('retains placeholder source separately from the resolved visible value', async () => {
  const { codec, document } = await convert('Project: %{project_name}', '<p>Project: <span data-placeholder="%{project_name}">My project</span></p>');
  expect(document.textContent).toBe('Project: My project');
  expect(codec.serialize({ doc: append(document) })).toBe('Project: %{project_name}\n\nAdded.');
});

it('decodes the GitLab original-text carrier once without losing quoted label syntax', async () => {
  const { codec, document } = await convert('~"A & B"', '<p><a href="/labels" data-original="~&amp;quot;A &amp;amp; B&amp;quot;" data-reference-type="label">A &amp; B</a></p>');
  expect(document.child(0).child(0).attrs.original).toBe('~"A & B"');
  expect(codec.serialize({ doc: append(document) })).toBe('~"A & B"\n\nAdded.');
});

it('cannot confuse literal text with temporary serialization tokens', async () => {
  const source = 'FOUNTAINGITLABSOURCETOKEN0END #1';
  const { codec, document } = await convert(source, '<p>FOUNTAINGITLABSOURCETOKEN0END <a href="/issues/1" data-reference-type="issue" data-original="#1">Issue one</a></p>');
  expect(codec.serialize({ doc: append(document) })).toBe(source + '\n\nAdded.');
});

it('imports nested task states without taking a checked descendant as the parent state', async () => {
  const html = '<ul class="task-list"><li class="task-list-item"><input type="checkbox" disabled>Parent<ul class="task-list"><li class="task-list-item"><input type="checkbox" checked disabled>Child</li></ul></li></ul>';
  const { codec, document } = await convert('- [ ] Parent\n  - [x] Child', html);
  expect(document.child(0).type.name).toBe('task_list');
  expect(document.child(0).child(0).attrs.checked).toBe(false);
  expect(document.child(0).child(0).child(1).child(0).attrs.checked).toBe(true);
  expect(codec.serialize({ doc: append(document) })).toContain('- [x] Child');
});

it('reports missing canonical image metadata after edits while leaving untouched source exact', async () => {
  const source = '![logo](app/assets/images/logo.svg)';
  const { codec, document } = await convert(source, data.fixtures.REPOSITORY_RELATIVE_IMAGE_WITHOUT_CANONICAL_SRC_HTML);
  expect(codec.serialize({ doc: document })).toBe(source);
  expect(codec.serializeWithReport({ doc: append(document) }).issues.some(issue => issue.code === 'canonical-image-source')).toBe(true);
  expect(() => codec.serialize({ doc: append(document) })).toThrow(GitLabMarkdownConversionError);
});

it.each([
  ['math-source', '<span class="katex">Flattened equation</span>'],
  ['math-source', '<code data-math-style="unknown">x^2</code>'],
  ['specialized-renderer', '<pre data-canonical-lang="mermaid">graph TD</pre>'],
  ['specialized-renderer', '<pre data-lang-params="frontmatter">title: Paper</pre>'],
  ['specialized-renderer', '<sup class="footnote-ref"><a href="#fn1">1</a></sup>'],
  ['task-source', '<ul class="task-list"><li>Bullet</li><li class="task-list-item"><input type="checkbox"><input type="checkbox">Ambiguous state</li></ul>'],
  ['task-source', '<ul class="task-list"><li class="task-list-item">No state</li></ul>'],
  ['rejected-url', '<p><a href="javascript:alert(1)">Unsafe</a></p>'],
  ['unmapped-inline-element', '<p><custom-widget>Opaque widget</custom-widget></p>'],
])('reports %s as unimplemented/invalid instead of silently flattening it', async (code, html) => {
  try { await convert('Original technical source', html); throw new Error('Expected conversion to refuse the input'); }
  catch (error) {
    expect(error).toBeInstanceOf(GitLabMarkdownConversionError);
    expect((error as GitLabMarkdownConversionError).originalMarkdown).toBe('Original technical source');
    expect((error as GitLabMarkdownConversionError).issues.some(issue => issue.code === code)).toBe(true);
  }
});

it.each(['mark', 'u', 'sub', 'sup'])('writes the actual GitLab <%s> dialect after an edit instead of another Markdown dialect', async tag => {
  const source = `<${tag}>Value</${tag}>`;
  const { codec, document } = await convert(source, `<p>${source}</p>`);
  expect(codec.serialize({ doc: append(document) })).toBe(source + '\n\nAdded.');
});

it('reports a highlight color that the default GitLab mark cannot retain', async () => {
  const source = '<mark style="background-color:#123456">Value</mark>';
  const { codec, document } = await convert(source, `<p>${source}</p>`);
  expect(codec.serialize({ doc: document })).toBe(source);
  expect(codec.serializeWithReport({ doc: append(document) }).issues.some(issue => issue.code === 'highlight-color')).toBe(true);
});

it('does not discard an authored alignment while normalizing renderer-added automatic direction', async () => {
  const source = '<p dir="auto" style="text-align:left">שלום</p>';
  const { codec, document } = await convert(source, source);
  expect(document.child(0).attrs.alignExplicit).toBe(true);
  expect(codec.serialize({ doc: document })).toBe(source);
  expect(codec.serializeWithReport({ doc: append(document) }).issues.some(issue => issue.code === 'attribute:paragraph')).toBe(true);
});

it.each([false,true])('serializes a cleared default document as empty host Markdown (caret leaf: %j)',async caret=>{
 const {codec,document,schema}=await convert('Saved paragraph.','<p>Saved paragraph.</p>');
 const cleared=document.copy([schema.node('paragraph',{},caret?[schema.text('')]:[])]);
 expect(codec.serializeWithReport({doc:cleared})).toEqual({markdown:'',preservation:'canonical',issues:[]});
});
it.each([' \n\t','<p data-fountain-empty="text"></p>'])('keeps untouched authored empty-looking source exact: %j',async source=>{
 const {codec,document}=await convert(source,'<p></p>');
 expect(codec.serializeWithReport({doc:document})).toEqual({markdown:source,preservation:'exact',issues:[]});
});
it('does not erase an authored extra blank paragraph or its formatting',async()=>{
 const {codec,document,schema}=await convert('Saved paragraph.','<p>Saved paragraph.</p>');
 const blank=schema.node('paragraph',{},[schema.text('')]);
 expect(codec.serialize({doc:document.copy([blank,blank])})).toContain('data-fountain-empty');
 const formatted=schema.node('paragraph',{},[schema.text('',[schema.mark('strong')])]);
 expect(codec.serializeWithReport({doc:document.copy([formatted])}).markdown).not.toBe('');
 const attributed=schema.node('paragraph',{align:'center'},[schema.text('')]);
 expect(codec.serializeWithReport({doc:document.copy([attributed])}).issues.length).toBeGreaterThan(0);
});
