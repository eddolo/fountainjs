import { describe, expect, it } from 'vitest';
import { composeExtensions, StarterKit, createMathExtension, Schema, createEditor, historyPlugin, undo } from 'fountainjs-editor';
import { MAX_EQUATION_FILE_BYTES, nextEquationLabel, parseEquationDocument, replaceEquationDocument } from '../examples/react-app/src/math-document-files';

const schema = new Schema(composeExtensions([...StarterKit.extensions, createMathExtension()]).schema);
describe('equation lab portable file boundary', () => {
  it('accepts harmless empty canonical fields but preserves root metadata through replacement and undo', () => {
    const first = parseEquationDocument('{"type":"doc","attrs":{"ownerNote":"first"},"content":[{"type":"paragraph","content":[{"type":"text","text":"One"}]}]}', schema);
    const second = parseEquationDocument('{"type":"doc","attrs":{"otherNote":"second"},"content":[{"type":"paragraph","attrs":{},"content":[],"marks":[]}]}', schema);
    const editor = createEditor({ schema: schema.spec, content: first.toJSON(), plugins: [historyPlugin] });
    expect(replaceEquationDocument(editor, editor.state.schema.nodeFromJSON(second.toJSON()))).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(second.toJSON());
    expect(editor.state.doc.attrs).toEqual({ otherNote: 'second' });
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(first.toJSON());
    editor.destroy();
  });
  it('round trips exact TeX, CRLF, labels and Unicode through JSON', () => {
    const source = '\\begin{equation}\r\n\\label{eq:extra-1}α=β\u200b\r\n\\end{equation}';
    const doc = schema.node('doc', {}, [schema.node('math_block', { latex: source })]);
    const reopened = parseEquationDocument(JSON.stringify(doc.toJSON()), schema);
    expect(reopened.eq(doc)).toBe(true);
    expect(reopened.child(0).attrs.latex).toBe(source);
    expect(nextEquationLabel(reopened, 0)).toEqual({ label: 'eq:extra-2', counter: 2 });
  });
  it.each(['{', 'null', '{"type":"paragraph"}', '{"type":"doc","content":[{"type":"unknown"}]}',
    '{"type":"doc","metadata":{"lost":true}}', '{"type":"doc","content":[{"type":"text","text":"bad root"}]}'])('rejects invalid or lossy input: %s', input => {
    expect(() => parseEquationDocument(input, schema)).toThrow();
  });
  it('bounds size before parsing and depth before recursive schema construction', () => {
    expect(() => parseEquationDocument(' '.repeat(MAX_EQUATION_FILE_BYTES + 1), schema)).toThrow('2 MiB');
    const nested = '['.repeat(70) + '0' + ']'.repeat(70);
    expect(() => parseEquationDocument(nested, schema)).toThrow('nesting');
  });
});
