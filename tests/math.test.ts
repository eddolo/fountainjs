/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  AllSelection,
  EditorView,
  GapSelection,
  HTMLExporter,
  HTMLImporter,
  MathExtension,
  MarkdownExporter,
  MarkdownImporter,
  NodeSelection,
  Schema,
  Selection,
  StarterKit,
  TextExporter,
  composeExtensions,
  createEditor,
  createKaTeXRenderer,
  createMathExtension,
  insertInlineMath,
  insertMathBlock,
  selectText,
  setMathSource,
  splitBlock,
} from '../src';

function mathKit(extension = MathExtension) {
  return composeExtensions([...StarterKit.extensions, extension]);
}

describe('first-party mathematics extension', () => {
  it('inserts and updates portable inline and display TeX', () => {
    const kit = mathKit();
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Euler wrote ' }] }],
      },
    });
    selectText(editor, [0, 0], 12);
    expect(insertInlineMath(editor, 'e^{i\\pi}+1=0', 'Euler identity')).toBe(true);
    expect(editor.state.doc.child(0).child(1).toJSON()).toEqual({
      type: 'inline_math',
      attrs: { latex: 'e^{i\\pi}+1=0', ariaLabel: 'Euler identity' },
    });
    expect(setMathSource(editor, 'e^{i\\pi}=-1')).toBe(true);
    expect(editor.state.doc.child(0).child(1).attrs.latex).toBe('e^{i\\pi}=-1');

    selectText(editor, [0, 2], 0);
    expect(insertMathBlock(editor, '\\int_0^1 x^2 \\, dx = \\frac{1}{3}')).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('math_block');
    expect(editor.state.selection.kind).toBe('node');
    expect(editor.state.doc.child(2).type.name).toBe('paragraph');
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.selection.eq(Selection.cursor([2, 0], 0))).toBe(true);
    expect(editor.getText()).toContain('e^{i\\pi}=-1');
    expect(editor.getText()).toContain('\\int_0^1 x^2');
  });

  it('inserts display math across structural selection types', () => {
    const kit = mathKit();
    const create = () => createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        ],
      },
    });

    const atGap = create();
    atGap.dispatch(atGap.state.createTransaction().setSelection(
      new GapSelection(atGap.state.doc, atGap.state.doc.child(0).nodeSize),
    ));
    expect(insertMathBlock(atGap, 'a=b')).toBe(true);
    expect(atGap.state.doc.content.map((node) => node.type.name)).toEqual([
      'paragraph', 'math_block', 'paragraph', 'paragraph',
    ]);

    const all = create();
    all.dispatch(all.state.createTransaction().setSelection(new AllSelection(all.state.doc)));
    expect(insertMathBlock(all, 'x=y')).toBe(true);
    expect(all.state.doc.content.map((node) => node.type.name)).toEqual(['math_block', 'paragraph']);
    expect(all.state.selection).toBeInstanceOf(NodeSelection);
  });

  it('round-trips math through JSON-safe HTML, Markdown, and plain text', () => {
    const schema = new Schema(mathKit().schema);
    const markdown = 'Energy is $E=mc^2$.\n\n$$\n\\sum_{i=1}^{n} i\n$$';
    const document = MarkdownImporter.parse(markdown, schema);
    expect(document.child(0).child(1).type.name).toBe('inline_math');
    expect(document.child(1).type.name).toBe('math_block');
    expect(MarkdownExporter.export(document)).toBe(markdown);
    expect(TextExporter.export(document)).toBe('Energy is E=mc^2.\n\\sum_{i=1}^{n} i');

    const html = HTMLExporter.export(document, { document: false });
    expect(html).toContain('data-fountain-math="inline"');
    expect(html).toContain('data-latex="E=mc^2"');
    const imported = HTMLImporter.parse(html, schema);
    expect(imported.toJSON()).toEqual(document.toJSON());

    const hostile = schema.node('doc', {}, [schema.node('math_block', {
      latex: '<img src=x onerror="alert(1)"> & y',
      ariaLabel: 'A "quoted" formula',
    })]);
    const hostileHTML = HTMLExporter.export(hostile, { document: false });
    expect(hostileHTML).not.toContain('<img src=x');
    expect(hostileHTML).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; y');
    expect(HTMLImporter.parse(hostileHTML, schema).toJSON()).toEqual(hostile.toJSON());
  });

  it('rejects empty, NUL-containing, and oversized command input', () => {
    const kit = mathKit();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    expect(insertInlineMath(editor, '')).toBe(false);
    expect(insertInlineMath(editor, 'x\0y')).toBe(false);
    expect(insertMathBlock(editor, 'x'.repeat(20_001))).toBe(false);
    expect(editor.state.doc.childCount).toBe(1);
  });

  it('converts typed math delimiters and restores the literal input on Backspace', () => {
    const kit = mathKit();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const type = (value: string) => view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value,
    }));

    '$x^2$'.split('').forEach(type);
    expect(editor.state.doc.child(0).child(0).type.name).toBe('inline_math');
    expect(editor.state.doc.child(0).child(0).attrs.latex).toBe('x^2');
    const undo = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    view.dom.dispatchEvent(undo);
    expect(undo.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('$x^2$');
    view.destroy();

    const displayEditor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const displayMount = document.createElement('div');
    document.body.appendChild(displayMount);
    const displayView = new EditorView(displayMount, displayEditor);
    const typeDisplay = (value: string) => displayView.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value,
    }));
    '$$x+y$$'.split('').forEach(typeDisplay);
    expect(displayEditor.state.doc.child(0).type.name).toBe('math_block');
    expect(displayEditor.state.doc.child(0).attrs.latex).toBe('x+y');
    expect(displayEditor.state.doc.child(1).type.name).toBe('paragraph');
    displayView.destroy();
  });

  it('parses pasted math Markdown through its independent paste rule', () => {
    const kit = mathKit();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/plain' ? 'Mass is $m$.' : '',
    } });
    view.dom.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    let source = '';
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'inline_math') source = String(node.attrs.latex);
    });
    expect(source).toBe('m');
    view.destroy();
  });

  it('uses caller-owned renderers safely and falls back to editable source on errors', () => {
    const katex = { render: vi.fn((latex: string, element: HTMLElement) => {
      const output = element.ownerDocument.createElement('b');
      output.textContent = `rendered:${latex}`;
      element.appendChild(output);
    }) };
    const extension = createMathExtension({ renderer: createKaTeXRenderer(katex) });
    const kit = mathKit(extension);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [{ type: 'math_block', attrs: { latex: 'x+y', ariaLabel: 'x plus y' } }] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    expect(view.dom.querySelector('[role="math"]')?.getAttribute('aria-label')).toBe('x plus y');
    expect(view.dom.querySelector('.fountain-math')?.textContent).toBe('rendered:x+y');
    expect(katex.render).toHaveBeenCalledWith('x+y', expect.any(HTMLElement), expect.objectContaining({
      displayMode: true,
      output: 'htmlAndMathml',
      trust: false,
    }));
    view.destroy();

    const onRenderError = vi.fn();
    const broken = mathKit(createMathExtension({
      renderer: () => { throw new Error('bad formula'); },
      onRenderError,
    }));
    const brokenEditor = createEditor({
      schema: broken.schema,
      plugins: broken.plugins,
      content: { type: 'doc', content: [{ type: 'math_block', attrs: { latex: '\\bad', ariaLabel: '' } }] },
    });
    const brokenMount = document.createElement('div');
    document.body.appendChild(brokenMount);
    const brokenView = new EditorView(brokenMount, brokenEditor);
    expect(brokenView.dom.querySelector('[data-fountain-math-error="true"] code')?.textContent).toBe('\\bad');
    expect(onRenderError).toHaveBeenCalledOnce();
    brokenView.destroy();
  });
});
