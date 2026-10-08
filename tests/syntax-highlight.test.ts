// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  AllSelection,
  EditorView,
  StarterKit,
  SyntaxHighlighter,
  composeExtensions,
  createEditor,
  createSyntaxHighlightExtension,
  getActiveCodeBlock,
  setCodeBlockLanguage,
  setTextColor,
  toggleCodeBlockLineNumbers,
  tokenizeCode,
  undo,
} from '../src';

const codeDocument = (language = 'typescript', lineNumbers = true) => ({
  type: 'doc',
  content: [{
    type: 'code_block',
    attrs: { language, lineNumbers },
    content: [{ type: 'text', text: 'const answer = "if";\n// return 42\nreturn answer;' }],
  }],
});

describe('language-aware code blocks', () => {
  it('tokenizes language syntax without highlighting words inside strings or comments', () => {
    const source = 'const answer = "if";\n// return 42\nreturn answer;';
    const tokens = tokenizeCode(source, 'ts');
    expect(tokens.map((token) => [source.slice(token.from, token.to), token.type])).toEqual([
      ['const', 'keyword'],
      ['"if"', 'string'],
      ['// return 42', 'comment'],
      ['return', 'keyword'],
    ]);
    const identifiers = 'myconstant returnValue return';
    expect(tokenizeCode(identifiers, 'javascript')
      .map((token) => identifiers.slice(token.from, token.to))).toEqual(['return']);
  });

  it('renders safe standalone highlighted HTML with balanced multiline tokens', () => {
    const html = new SyntaxHighlighter().highlight('/* first\nsecond */\nconst value = "<tag>";', 'javascript');
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelectorAll('.fjs-line')).toHaveLength(3);
    expect(container.querySelectorAll('.fjs-token--comment')).toHaveLength(2);
    expect(container.querySelector('.fjs-token--string')?.textContent).toBe('"<tag>"');
    expect(container.querySelector('tag')).toBeNull();
  });

  it('decorates editable StarterKit code without changing portable JSON', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: codeDocument(),
    });
    const before = editor.getJSON();
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const block = view.dom.querySelector('pre[data-language="typescript"]');

    expect(block?.classList.contains('fjs-code-block')).toBe(true);
    expect(block?.getAttribute('title')).toBe('typescript');
    expect([...view.dom.querySelectorAll('.fjs-token--keyword')].map((node) => node.textContent)).toEqual(['const', 'return']);
    expect(view.dom.querySelector('.fjs-token--comment')?.textContent).toBe('// return 42');
    expect(view.dom.querySelectorAll('.fjs-code-line-number')).toHaveLength(3);
    expect([...view.dom.querySelectorAll<HTMLElement>('.fjs-code-line-number')].map((node) => node.dataset.line)).toEqual(['1', '2', '3']);
    expect(block?.textContent).toBe('const answer = "if";\n// return 42\nreturn answer;');
    expect(editor.getJSON()).toEqual(before);
    view.destroy();
  });

  it('updates language and line-number presentation through public commands', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: codeDocument('ts'),
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);

    expect(getActiveCodeBlock(editor)).toMatchObject({ path: [0], language: 'typescript', lineNumbers: true });
    expect(setCodeBlockLanguage(editor, 'PY')).toBe(true);
    expect(editor.state.doc.child(0).attrs.language).toBe('python');
    expect(view.dom.querySelector('pre')?.dataset.language).toBe('python');
    expect(setCodeBlockLanguage(editor, ';')).toBe(true);
    expect(view.dom.querySelector('pre')?.dataset.language).toBe(';');
    expect(toggleCodeBlockLineNumbers(editor, false)).toBe(true);
    expect(view.dom.querySelectorAll('.fjs-code-line-number')).toHaveLength(0);
    expect(setCodeBlockLanguage(editor, '<script>')).toBe(true);
    expect(view.dom.querySelector('script')).toBeNull();
    expect(editor.state.doc.child(0).attrs.language).toBe('<script>');
    view.destroy();
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('handles unregistered prototype-like label %s without crashing or changing document data', language => {
    expect(() => tokenizeCode('const n = 1;', language)).not.toThrow();
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: codeDocument(language) });
    const before = editor.getJSON();
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    expect(view.dom.querySelector('pre')?.textContent).toBe('const answer = "if";\n// return 42\nreturn answer;');
    expect(editor.getJSON()).toEqual(before);
    view.destroy();
    mount.remove();
  });

  it('accepts a host tokenizer while filtering unsafe or overlapping ranges', () => {
    const custom = createSyntaxHighlightExtension({
      tokenizer: () => [
        { from: 0, to: 5, type: 'function' },
        { from: 2, to: 8, type: 'overlap' },
        { from: 6, to: 8, type: 'bad class!' },
      ],
      lineNumbers: false,
      theme: 'light',
    });
    const kit = composeExtensions([CoreExtension, custom]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: codeDocument('custom') });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);

    expect(view.dom.querySelectorAll('.fjs-token--function')).toHaveLength(1);
    expect(view.dom.querySelector('.fjs-highlight--light')).toBeTruthy();
    expect(view.dom.querySelectorAll('[data-fountain-syntax-token]')).toHaveLength(1);
    expect(view.dom.querySelectorAll('.fjs-code-line-number')).toHaveLength(0);
    view.destroy();
  });

  it.each([
    ['#000000', undefined, undefined, 'light'],
    ['#ffffff', undefined, undefined, 'dark'],
    [undefined, '#ffffff', undefined, 'light'],
    [undefined, '#151823', undefined, 'dark'],
    ['#000000', undefined, 'dark', 'dark'],
    ['#ffffff', undefined, 'light', 'light'],
  ] as const)('uses readable source-aware defaults without changing marks or owned layout: %s/%s/%s', (color, background, theme, expected) => {
    const kit = composeExtensions([CoreExtension, createSyntaxHighlightExtension({ theme })]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: {
      type: 'doc', content: [{ type: 'code_block', attrs: { language: 'python',
        ...(background ? { layout: { unit: 'pt', background } } : {}) },
      content: [{ type: 'text', text: 'value = 1\nprint(value)',
        ...(color ? { marks: [{ type: 'text_color', attrs: { color } }] } : {}) }] }],
    } });
    const before = editor.getJSON();
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    try {
      expect(view.dom.querySelector('pre')?.classList.contains(`fjs-highlight--${expected}`)).toBe(true);
      if (color) expect(view.dom.querySelector('code span[style*="color"]')?.getAttribute('style')).toContain(color);
      if (background) expect(view.dom.querySelector('pre')?.getAttribute('style')).toContain(background);
      expect(editor.getJSON()).toEqual(before);
      expect(view.dom.querySelector('pre')?.textContent).toBe('value = 1\nprint(value)');
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });

  it('reports a host tokenizer failure and falls back without breaking rendering', () => {
    const failures: unknown[] = [];
    const highlighter = new SyntaxHighlighter({
      tokenizer: () => { throw new Error('grammar unavailable'); },
      onTokenizeError: (error) => failures.push(error),
    });
    const container = document.createElement('div');
    container.innerHTML = highlighter.highlight('const safe = 1;', 'javascript');
    expect(failures).toHaveLength(1);
    expect(container.querySelector('.fjs-token--keyword')?.textContent).toBe('const');
  });

  it('updates the source-aware palette through a real colour transaction and undo', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: { type: 'doc', content: [{ type: 'code_block', content: [{ type: 'text', text: 'value',
        marks: [{ type: 'text_color', attrs: { color: '#000000' } }] }] }] } });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor); const before = editor.getJSON();
    try {
      expect(view.dom.querySelector('pre.fjs-highlight--light')).toBeTruthy();
      editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
      expect(setTextColor(editor, '#ffffff')).toBe(true);
      expect(view.dom.querySelector('pre.fjs-highlight--dark')).toBeTruthy();
      expect(undo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(before);
      expect(view.dom.querySelector('pre.fjs-highlight--light')).toBeTruthy();
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });

  it('does not change the default palette for text with its own highlight background', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: { type: 'doc', content: [{ type: 'code_block', content: [{ type: 'text', text: 'value',
        marks: [{ type: 'text_color', attrs: { color: '#000000' } }, { type: 'highlight', attrs: { color: '#ffffff' } }] }] }] } });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor); const before = editor.getJSON();
    try {
      expect(view.dom.querySelector('pre.fjs-highlight--dark')).toBeTruthy();
      expect(view.dom.querySelector('code mark')).toBeTruthy();
      expect(editor.getJSON()).toEqual(before);
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });
});
