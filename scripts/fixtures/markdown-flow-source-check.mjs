import { CoreSchemaSpec, MarkdownImporter, Schema } from '../../dist/index.js';

export function checkMarkdownFlowSources() {
  const schema = new Schema(CoreSchemaSpec);
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
  return true;
}
