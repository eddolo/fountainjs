import { CoreSchemaSpec, HTMLContainerExtension, MarkdownImporter, MarkdownExporter, Schema, tokenizeCode } from '../../dist/index.js';
import { ServerHTMLImporter } from '../../dist/html-server.js';
import { createEditor, insertHTMLContainer, appendHTMLContainerParagraph, unwrapHTMLContainer } from '../../dist/core.js';

export function checkMarkdownFlowSources() {
  const schema = new Schema(CoreSchemaSpec);
  const documentFlow = MarkdownImporter.parse('<a href="/guide">First\n\nSecond</a>', schema, { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow });
  if (documentFlow.content.filter(node => node.textContent.trim()).some(node => !node.child(0).marks.some(mark => mark.type.name === 'link' && mark.attrs.href === '/guide'))) {
    throw new Error('Compiled document-level HTML scope did not survive the paragraph boundary.');
  }
  const containers = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes } });
  const preservedSection = ServerHTMLImporter.parse('<section id="release"><p>Portable section</p></section>', containers);
  const reopenedSection = MarkdownImporter.parse(MarkdownExporter.export(preservedSection), containers, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow });
  if (!reopenedSection.eq(preservedSection) || preservedSection.child(0).attrs.id !== 'release') throw new Error('Compiled optional HTML container handoff lost structure.');
  const sectionEditor = createEditor({ schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes } }, content: preservedSection.toJSON() });
  if (!insertHTMLContainer(sectionEditor) || !appendHTMLContainerParagraph(sectionEditor, [1]) || !unwrapHTMLContainer(sectionEditor, [1])
    || sectionEditor.state.doc.child(1).type.name !== 'paragraph' || sectionEditor.state.doc.child(0).attrs.id !== 'release') {
    throw new Error('Compiled DOM-free section authoring failed.');
  }
  sectionEditor.destroy();
  const recoveredCode = MarkdownImporter.parse('<div>\n\n```js\nx\n```\n\n```js\nx\n\n```\n\n</div>', schema, {
    parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
  });
  if (recoveredCode.child(0).textContent !== 'x' || recoveredCode.child(1).textContent !== 'x\n') {
    throw new Error('Compiled source recovery confused generated and authored code endings.');
  }
  const definitions = ServerHTMLImporter.parse('<dl><dt>Latency</dt><dd>Time to respond.</dd><dt>Throughput</dt><dd>Work per second.</dd></dl>', schema);
  const reopenedDefinitions = MarkdownImporter.parse(MarkdownExporter.export(definitions), schema, {
    parseHTMLBlock: (html, target) => ServerHTMLImporter.parseFragment(html, target),
  });
  if (definitions.child(0).type.name !== 'definition_list' || definitions.child(0).childCount !== 4
    || !reopenedDefinitions.eq(definitions)) throw new Error('Compiled definition-list import/export changed term or description structure.');
  const omitted = ServerHTMLImporter.parseWithReport('<section id="private"><p>Content</p></section>', schema);
  if (omitted.document.child(0).type.name !== 'paragraph'
    || !omitted.issues.some(issue => issue.code === 'unmapped-block-wrapper')
    || JSON.stringify(omitted.issues).includes('private')) {
    throw new Error('Compiled HTML conversion did not report a removed standard wrapper safely.');
  }
  const sectionSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    section: { group: 'block', content: 'block+', parseHTML: [{ tag: 'section' }] },
  } });
  const section = MarkdownImporter.parse('<section>\n\none  \ntwo\n\n</section>', sectionSchema, {
    parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
  }).child(0);
  if (section.type.name !== 'section' || section.child(0).content.filter(node => node.type.name === 'hard_break').length !== 1) {
    throw new Error('Compiled source recovery double-counted a speculative custom-wrapper projection.');
  }
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
