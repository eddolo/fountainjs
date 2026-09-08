import { CoreSchemaSpec, MarkdownImporter, MarkdownExporter, Schema, tokenizeCode } from '../../dist/index.js';
import { ServerHTMLImporter } from '../../dist/html-server.js';

export function checkMarkdownFlowSources() {
  const schema = new Schema(CoreSchemaSpec);
  const tasks = MarkdownImporter.parse('<blockquote>\n\n- [ ] Inspect\n  - [x] Reviewed\n\n</blockquote>', schema, {
    parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
  }).child(0).child(0);
  if (tasks.type.name !== 'task_list' || tasks.child(0).attrs.checked !== false
    || tasks.child(0).child(1).child(0).attrs.checked !== true) {
    throw new Error('Compiled source recovery lost nested task structure or checked state.');
  }
  const image = MarkdownImporter.parse('<blockquote>\n\nBefore **![Diagram](/diagram.png "Caption")** after\n\n</blockquote>', schema, {
    parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
  }).child(0).child(0).content.find(node => node.type.name === 'inline_image');
  if (!image || image.attrs.src !== '/diagram.png' || image.attrs.alt !== 'Diagram' || image.attrs.title !== 'Caption'
    || image.marks[0]?.type.name !== 'strong') throw new Error('Compiled structural flow lost inline image data or marks.');
  for (const body of ['one  \ntwo', 'one\\\ntwo']) {
    const source = `<div><pre>\n\n${body}\n\n</pre></div>`;
    const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow });
    if (parsed.document.child(0).type.name !== 'code_block' || parsed.document.child(0).textContent !== 'one\ntwo\n'
      || MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown !== source) {
      throw new Error('Compiled hard-break source recovery lost line-break semantics or original source.');
    }
  }
  const nested = MarkdownImporter.parse('<blockquote>\n\n3. first\n   - child\n4. > quoted\n\n</blockquote>', schema, {
    parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
  });
  const list = nested.child(0).child(0);
  if (list.type.name !== 'ordered_list' || list.attrs.start !== 3
    || list.child(0).child(1).type.name !== 'bullet_list' || list.child(1).child(0).type.name !== 'blockquote') {
    throw new Error('Compiled structural flow lost list/quote nesting or the ordered start.');
  }
  const inspect = source => {
    let context;
    MarkdownImporter.parse(`<div><pre>\n\n${source}\n\n</pre></div>`, schema, {
      parseHTMLFlow(_segments, _schema, supplied) { context = supplied; return null; },
    });
    if (!context) throw new Error('Compiled importer omitted paragraph source context.');
    const paragraphs = context.readParagraphSources();
    if (!Object.isFrozen(paragraphs) || context.readParagraphSources() !== paragraphs) {
      throw new Error('Compiled paragraph inspection is not cached and frozen.');
    }
    if (paragraphs[0].source !== source) throw new Error('Compiled paragraph syntax input changed.');
    return paragraphs[0].segments;
  };
  const multiline = inspect('one\ntwo');
  const singleline = inspect('one two');
  if (!multiline.some(segment => segment.kind === 'node' && segment.softBreak)
    || singleline.some(segment => segment.kind === 'node' && segment.softBreak)) {
    throw new Error('Compiled paragraph context lost the LF/space distinction.');
  }
  if (!inspect('*word* </pre>').some(segment => segment.kind === 'html' && segment.html === '</pre>')) {
    throw new Error('Compiled paragraph context lost a raw closing token.');
  }
  const recovered = MarkdownImporter.parse('<div><pre>\n\none\ntwo\n\n</pre></div>', schema, {
    parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow,
  });
  if (recovered.child(0).type.name !== 'code_block' || recovered.child(0).textContent !== 'one\ntwo\n') {
    throw new Error('Compiled paragraph-source flow recovery lost preformatted content.');
  }
  const textBlocks = MarkdownImporter.parse('<div><pre>\n\n# Title\n\n```\nx\n```\n\n</pre></div>', schema, {
    parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
  });
  if (textBlocks.child(0).type.name !== 'code_block' || textBlocks.child(0).textContent !== 'Title\nx\n\n') {
    throw new Error('Compiled text-block source flow lost heading/code wrappers or generated newlines.');
  }
  if (ServerHTMLImporter.parse('<pre><code class="language-c++">x</code></pre>', schema).child(0).attrs.language !== 'c++') {
    throw new Error('Compiled HTML importer truncated the code language token.');
  }
  for (const label of ['x"y', 'constructor', '__proto__', 'x'.repeat(100), 'a&amp;b']) {
    const doc = schema.node('doc', {}, [schema.node('code_block', { language: label }, [schema.text('x')])]);
    const reopened = MarkdownImporter.parse(MarkdownExporter.export(doc), schema);
    if (reopened.child(0).attrs.language !== label) throw new Error('Compiled canonical Markdown changed an opaque code label.');
    tokenizeCode('const x = 1;', label);
  }
  return true;
}
