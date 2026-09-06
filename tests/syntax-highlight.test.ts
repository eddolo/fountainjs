// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  EditorView,
  StarterKit,
  SyntaxHighlighter,
  composeExtensions,
  createEditor,
  createSyntaxHighlightExtension,
  getActiveCodeBlock,
  setCodeBlockLanguage,
  toggleCodeBlockLineNumbers,
  tokenizeCode,
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
    expect(setCodeBlockLanguage(editor, '<script>')).toBe(false);
    view.destroy();
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
});
