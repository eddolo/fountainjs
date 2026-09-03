import { Decoration, DecorationSet } from '../../core/decoration';
import type { Editor } from '../../core/editor';
import { Plugin } from '../../core/plugin';
import type { Node } from '../../core/schema';
import { NodeSelection } from '../../core/selection';
import type { EditorState } from '../../core/state';
import { getNodeAtPath } from '../../core/transaction/path';
import { setNodeAttributes } from '../../core/structure-commands';
import { defineExtension, type FountainExtension } from '../extension';

export type SyntaxTokenType = 'keyword' | 'string' | 'number' | 'comment' | 'tag' | 'symbol';

export interface SyntaxToken {
  readonly from: number;
  readonly to: number;
  readonly type: SyntaxTokenType | (string & {});
}

export type SyntaxTokenizer = (code: string, language: string) => readonly SyntaxToken[];

export interface SyntaxHighlightConfig {
  theme?: 'light' | 'dark';
  /** Enables line-number decorations when the code block also has `lineNumbers: true`. */
  lineNumbers?: boolean;
  /** Trusted HTML renderer used only by `SyntaxHighlighter.highlight()`. */
  highlighter?: (code: string, language: string) => string;
  /** Safe range tokenizer used by the live editor plugin. */
  tokenizer?: SyntaxTokenizer;
  /** Maximum source length sent to a tokenizer. Defaults to 200,000 characters. */
  maxCodeLength?: number;
  /** Maximum line-number decorations per block. Defaults to 10,000. */
  maxLineNumbers?: number;
  onTokenizeError?: (error: unknown, context: { code: string; language: string }) => void;
}

export const DEFAULT_MAX_HIGHLIGHT_CODE_LENGTH = 200_000;
export const DEFAULT_MAX_CODE_LINE_NUMBERS = 10_000;

export const CODE_BLOCK_LANGUAGES = Object.freeze([
  'text', 'javascript', 'typescript', 'jsx', 'tsx', 'html', 'css', 'json',
  'python', 'sql', 'bash', 'shell', 'lean', 'rust', 'go', 'java', 'c', 'cpp',
] as const);

const KEYWORDS: Record<string, readonly string[]> = {
  javascript: ['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'else', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'while', 'yield'],
  typescript: ['abstract', 'any', 'as', 'async', 'await', 'boolean', 'class', 'const', 'declare', 'else', 'enum', 'export', 'extends', 'false', 'from', 'function', 'generic', 'if', 'implements', 'import', 'interface', 'keyof', 'let', 'never', 'new', 'null', 'number', 'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'static', 'string', 'super', 'this', 'throw', 'true', 'type', 'typeof', 'undefined', 'unknown', 'void'],
  python: ['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield'],
  sql: ['alter', 'and', 'as', 'asc', 'by', 'case', 'create', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'from', 'group', 'having', 'in', 'insert', 'into', 'join', 'limit', 'not', 'null', 'on', 'or', 'order', 'select', 'set', 'table', 'then', 'union', 'update', 'values', 'when', 'where'],
  css: ['@container', '@font-face', '@keyframes', '@media', '@supports', 'calc', 'color', 'display', 'font', 'gap', 'grid', 'height', 'margin', 'padding', 'position', 'var', 'width'],
  json: ['false', 'null', 'true'],
  bash: ['case', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in', 'local', 'readonly', 'select', 'then', 'until', 'while'],
  lean: ['abbrev', 'axiom', 'by', 'class', 'def', 'deriving', 'do', 'else', 'end', 'example', 'exists', 'export', 'extends', 'false', 'for', 'forall', 'from', 'fun', 'if', 'import', 'in', 'inductive', 'instance', 'let', 'match', 'namespace', 'open', 'opaque', 'partial', 'private', 'protected', 'return', 'section', 'structure', 'syntax', 'theorem', 'then', 'true', 'universe', 'variable', 'where', 'with'],
  rust: ['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'],
  go: ['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var'],
  java: ['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try', 'void', 'volatile', 'while'],
  c: ['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while'],
  cpp: ['alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'if', 'inline', 'int', 'long', 'namespace', 'new', 'nullptr', 'operator', 'private', 'protected', 'public', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'while'],
};

const ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript',
  py: 'python', sh: 'bash', shell: 'bash', lean4: 'lean', cxx: 'cpp', 'c++': 'cpp',
};

const CASE_INSENSITIVE = new Set(['css', 'html', 'sql']);
const JS_LIKE = new Set(['javascript', 'typescript', 'jsx', 'tsx', 'java', 'go', 'rust', 'c', 'cpp']);
const C_LIKE = new Set([...JS_LIKE, 'css']);

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeCodeLanguage(language: string): string {
  const value = language.trim().toLowerCase() || 'text';
  return ALIASES[value] ?? value;
}

function commentPattern(language: string): string | null {
  if (language === 'html') return '<!--[\\s\\S]*?-->';
  if (language === 'lean') return '(?:--[^\\n]*|\\/-[\\s\\S]*?-\\/)';
  if (language === 'python' || language === 'bash') return '#[^\\n]*';
  if (language === 'sql') return '(?:--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)';
  if (C_LIKE.has(language)) return '(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)';
  return null;
}

/** Lightweight built-in tokenizer. Supply `config.tokenizer` to register a full grammar engine. */
export function tokenizeCode(code: string, requestedLanguage = 'text'): readonly SyntaxToken[] {
  const language = normalizeCodeLanguage(requestedLanguage);
  const tokenLanguage = language === 'jsx' ? 'javascript' : language === 'tsx' ? 'typescript' : language;
  const keywords = KEYWORDS[tokenLanguage] ?? [];
  const alternatives: string[] = [];
  const comments = commentPattern(language);
  if (comments) alternatives.push(`(?<comment>${comments})`);
  if (language === 'html') alternatives.push('(?<tag><\\/?[A-Za-z][^>]*>)');
  alternatives.push('(?<string>"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)');
  alternatives.push('(?<number>\\b(?:0x[\\da-f]+|\\d+(?:\\.\\d+)?)\\b)');
  if (keywords.length) alternatives.push(`(?<keyword>${keywords.map(escapeRegExp).sort((left, right) => right.length - left.length).join('|')})`);

  const expression = new RegExp(alternatives.join('|'), CASE_INSENSITIVE.has(language) ? 'gi' : 'g');
  const tokens: SyntaxToken[] = [];
  for (const match of code.matchAll(expression)) {
    const value = match[0];
    const from = match.index ?? 0;
    const group = Object.entries(match.groups ?? {}).find(([, captured]) => captured !== undefined)?.[0] ?? 'symbol';
    // Keyword alternatives need explicit boundaries without breaking @-prefixed CSS tokens.
    if (group === 'keyword') {
      const before = code[from - 1] ?? '';
      const after = code[from + value.length] ?? '';
      if ((/[$\w]/.test(before) || /[$\w]/.test(after)) && !value.startsWith('@')) continue;
    }
    tokens.push({ from, to: from + value.length, type: group });
  }
  return tokens;
}

function validTokens(code: string, tokens: readonly SyntaxToken[]): readonly SyntaxToken[] {
  const candidates = tokens
    .filter((token) => Number.isInteger(token.from) && Number.isInteger(token.to)
      && token.from >= 0 && token.to > token.from && token.to <= code.length
      && /^[a-z][a-z0-9-]{0,30}$/i.test(token.type))
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const accepted: SyntaxToken[] = [];
  for (const token of candidates) {
    if (token.from >= (accepted.at(-1)?.to ?? 0)) accepted.push(token);
  }
  return accepted;
}

function limit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function tokenizeSafely(code: string, language: string, config: SyntaxHighlightConfig): readonly SyntaxToken[] {
  if (code.length > limit(config.maxCodeLength, DEFAULT_MAX_HIGHLIGHT_CODE_LENGTH)) return [];
  const tokenizer = config.tokenizer ?? tokenizeCode;
  try { return validTokens(code, tokenizer(code, language)); }
  catch (error) {
    try { config.onTokenizeError?.(error, { code, language }); } catch { /* Error reporting cannot break rendering. */ }
    return tokenizer === tokenizeCode ? [] : validTokens(code, tokenizeCode(code, language));
  }
}

function renderTokenized(code: string, tokens: readonly SyntaxToken[]): string {
  let cursor = 0;
  let html = '';
  for (const token of validTokens(code, tokens)) {
    html += escapeHTML(code.slice(cursor, token.from));
    const className = `fjs-token fjs-token--${token.type}`;
    html += code.slice(token.from, token.to).split('\n')
      .map((part) => `<span class="${className}">${escapeHTML(part)}</span>`)
      .join('\n');
    cursor = token.to;
  }
  return html + escapeHTML(code.slice(cursor));
}

export class SyntaxHighlighter {
  private readonly config: Required<Pick<SyntaxHighlightConfig, 'theme' | 'lineNumbers' | 'maxCodeLength' | 'maxLineNumbers'>>
    & Pick<SyntaxHighlightConfig, 'highlighter' | 'tokenizer' | 'onTokenizeError'>;

  constructor(config: SyntaxHighlightConfig = {}) {
    this.config = {
      theme: 'dark',
      lineNumbers: true,
      maxCodeLength: DEFAULT_MAX_HIGHLIGHT_CODE_LENGTH,
      maxLineNumbers: DEFAULT_MAX_CODE_LINE_NUMBERS,
      ...config,
    };
  }

  highlight(code: string, language = 'text'): string {
    const normalized = normalizeCodeLanguage(language);
    const rendered = this.config.highlighter
      ? this.config.highlighter(code, normalized)
      : renderTokenized(code, tokenizeSafely(code, normalized, this.config));
    const lines = rendered.split('\n').map((line, index) => `<span class="fjs-line"${this.config.lineNumbers ? ` data-line="${index + 1}"` : ''}>${line || ' '}</span>`).join('\n');
    return `<pre class="fjs-highlight fjs-highlight--${this.config.theme}" data-language="${escapeHTML(normalized)}"><code>${lines}</code></pre>`;
  }

  generateCSS(): string {
    return `.fjs-highlight{overflow:auto;padding:1rem;border-radius:.75rem}.fjs-highlight code{font:13px/1.6 ui-monospace,monospace}.fjs-highlight--dark{color:#e7e9ee;background:#151823}.fjs-highlight--light{color:#272437;background:#f7f5f0}.fjs-line{display:block}.fjs-line[data-line]::before{display:inline-block;width:2.5em;margin-right:1em;color:#777;text-align:right;content:attr(data-line);user-select:none}.fjs-token--keyword{color:#c9a7ff}.fjs-token--string{color:#a8e6b1}.fjs-token--number{color:#ffc98b}.fjs-token--comment{color:#7d8396;font-style:italic}.fjs-token--tag,.fjs-token--symbol{color:#8bd5ff}`;
  }
}

const lineNumberFactories = new Map<number, () => HTMLElement>();

function lineNumberFactory(line: number): () => HTMLElement {
  let factory = lineNumberFactories.get(line);
  if (!factory) {
    factory = () => {
      const element = document.createElement('span');
      element.className = 'fjs-code-line-number';
      element.dataset.line = String(line);
      element.setAttribute('aria-hidden', 'true');
      return element;
    };
    lineNumberFactories.set(line, factory);
  }
  return factory;
}

function collectCodeDecorations(state: EditorState, config: SyntaxHighlightConfig): DecorationSet {
  const decorations: Decoration[] = [];
  const theme = config.theme ?? 'dark';
  const showLineNumbers = config.lineNumbers ?? true;
  const maxCodeLength = limit(config.maxCodeLength, DEFAULT_MAX_HIGHLIGHT_CODE_LENGTH);
  const maxLineNumbers = limit(config.maxLineNumbers, DEFAULT_MAX_CODE_LINE_NUMBERS);

  const visit = (node: Node, before: number, root = false, path: readonly number[] = []): void => {
    if (node.type.name === 'code_block') {
      const language = normalizeCodeLanguage(String(node.attrs.language ?? 'text'));
      const code = node.textContent;
      const textStart = before + 1;
      decorations.push(Decoration.node(before, before + node.nodeSize, {
        class: `fjs-code-block fjs-highlight--${theme}`,
        'data-language': language,
        'data-fountain-syntax-truncated': code.length > maxCodeLength ? 'true' : undefined,
      }, { key: `syntax-block-${path.join('.')}` }));
      for (const token of tokenizeSafely(code, language, config)) {
        decorations.push(Decoration.inline(textStart + token.from, textStart + token.to, {
          class: `fjs-token fjs-token--${token.type}`,
          'data-fountain-syntax-token': token.type,
        }, { key: `syntax-${path.join('.')}-${token.from}-${token.to}-${token.type}` }));
      }
      if (showLineNumbers && node.attrs.lineNumbers !== false && maxLineNumbers > 0) {
        const starts = [0];
        for (let index = 0; index < code.length && starts.length < maxLineNumbers; index += 1) {
          if (code[index] === '\n') starts.push(index + 1);
        }
        starts.forEach((offset, index) => decorations.push(Decoration.widget(
          textStart + offset,
          lineNumberFactory(index + 1),
          { key: `syntax-line-${path.join('.')}-${index + 1}`, side: -1 },
        )));
      }
      return;
    }

    let position = before + (root ? 0 : 1);
    node.content.forEach((child, index) => {
      visit(child, position, false, [...path, index]);
      position += child.nodeSize;
    });
  };
  visit(state.doc, 0, true);
  return DecorationSet.create(state.doc, decorations);
}

export function createSyntaxHighlightPlugin(config: SyntaxHighlightConfig = {}): Plugin {
  return new Plugin({ props: { decorations: (state) => collectCodeDecorations(state, config) } });
}

export interface ActiveCodeBlock {
  readonly path: readonly number[];
  readonly language: string;
  readonly lineNumbers: boolean;
}

export function getActiveCodeBlock(editor: Editor): ActiveCodeBlock | null {
  const selection = editor.state.selection;
  const origin = selection instanceof NodeSelection ? selection.nodePath : selection.path;
  for (let length = origin.length; length > 0; length -= 1) {
    const path = origin.slice(0, length);
    try {
      const node = getNodeAtPath(editor.state.doc, path);
      if (node.type.name === 'code_block') return {
        path: Object.freeze([...path]),
        language: normalizeCodeLanguage(String(node.attrs.language ?? 'text')),
        lineNumbers: node.attrs.lineNumbers !== false,
      };
    } catch { return null; }
  }
  return null;
}

export function setCodeBlockLanguage(editor: Editor, language: string): boolean {
  const active = getActiveCodeBlock(editor);
  if (!active) return false;
  const normalized = normalizeCodeLanguage(language);
  if (!/^[\w.+#-]{1,50}$/.test(normalized)) return false;
  return setNodeAttributes(editor, active.path, { language: normalized });
}

export function toggleCodeBlockLineNumbers(editor: Editor, visible?: boolean): boolean {
  const active = getActiveCodeBlock(editor);
  return active ? setNodeAttributes(editor, active.path, { lineNumbers: visible ?? !active.lineNumbers }) : false;
}

export function createSyntaxHighlightExtension(config: SyntaxHighlightConfig = {}): FountainExtension {
  return defineExtension({
    name: 'syntax-highlight',
    plugins: [createSyntaxHighlightPlugin(config)],
    commands: { setCodeBlockLanguage, toggleCodeBlockLineNumbers },
  });
}

export const SyntaxHighlightExtension = createSyntaxHighlightExtension();

/** Standalone renderer plus the matching live-editor plugin for compatibility with the original API. */
export class SyntaxHighlightPlugin {
  private readonly highlighter: SyntaxHighlighter;
  private readonly plugin: Plugin;
  constructor(private readonly config: SyntaxHighlightConfig = {}) {
    this.highlighter = new SyntaxHighlighter(config);
    this.plugin = createSyntaxHighlightPlugin(config);
  }
  getHighlighter(): SyntaxHighlighter { return this.highlighter; }
  getPlugin(): Plugin { return this.plugin; }
  getCSS(): string { return this.highlighter.generateCSS(); }
}
