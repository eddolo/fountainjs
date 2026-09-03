export interface SyntaxHighlightConfig {
  theme?: 'light' | 'dark';
  lineNumbers?: boolean;
  highlighter?: (code: string, language: string) => string;
}

const KEYWORDS: Record<string, string[]> = {
  javascript: ['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'else', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'while', 'yield'],
  typescript: ['abstract', 'any', 'as', 'async', 'await', 'boolean', 'class', 'const', 'declare', 'else', 'enum', 'export', 'extends', 'false', 'from', 'function', 'generic', 'if', 'implements', 'import', 'interface', 'keyof', 'let', 'never', 'new', 'null', 'number', 'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'static', 'string', 'super', 'this', 'throw', 'true', 'type', 'typeof', 'undefined', 'unknown', 'void'],
  python: ['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield'],
  sql: ['alter', 'and', 'as', 'asc', 'by', 'case', 'create', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'from', 'group', 'having', 'in', 'insert', 'into', 'join', 'limit', 'not', 'null', 'on', 'or', 'order', 'select', 'set', 'table', 'then', 'union', 'update', 'values', 'when', 'where'],
  css: ['@media', '@supports', 'calc', 'color', 'display', 'font', 'gap', 'grid', 'height', 'margin', 'padding', 'position', 'var', 'width'],
};

const ALIASES: Record<string, string> = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python' };

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function builtInHighlight(code: string, language: string): string {
  const normalized = ALIASES[language.toLowerCase()] ?? language.toLowerCase();
  const keywords = KEYWORDS[normalized] ?? [];
  if (!keywords.length && !['json', 'bash', 'shell'].includes(normalized)) return escapeHTML(code);
  const keywordPattern = keywords.length ? `|\\b(?:${keywords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b` : '';
  const tokenPattern = new RegExp(`("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|//[^\\n]*|/\\*[\\s\\S]*?\\*/|#[^\\n]*|\\b\\d+(?:\\.\\d+)?\\b${keywordPattern})`, 'gi');
  let cursor = 0;
  let html = '';
  for (const match of code.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    html += escapeHTML(code.slice(cursor, index));
    const token = match[0];
    const lower = token.toLowerCase();
    const kind = token.startsWith('//') || token.startsWith('/*') || (token.startsWith('#') && normalized === 'python')
      ? 'comment'
      : /^['"`]/.test(token)
        ? 'string'
        : /^\d/.test(token)
          ? 'number'
          : keywords.some((word) => word.toLowerCase() === lower)
            ? 'keyword'
            : 'symbol';
    html += `<span class="fjs-token fjs-token--${kind}">${escapeHTML(token)}</span>`;
    cursor = index + token.length;
  }
  return html + escapeHTML(code.slice(cursor));
}

export class SyntaxHighlighter {
  private readonly config: Required<Omit<SyntaxHighlightConfig, 'highlighter'>> & Pick<SyntaxHighlightConfig, 'highlighter'>;

  constructor(config: SyntaxHighlightConfig = {}) {
    this.config = { theme: 'dark', lineNumbers: true, ...config };
  }

  highlight(code: string, language = 'text'): string {
    const rendered = this.config.highlighter ? this.config.highlighter(code, language) : builtInHighlight(code, language);
    const lines = rendered.split('\n').map((line, index) => `<span class="fjs-line"${this.config.lineNumbers ? ` data-line="${index + 1}"` : ''}>${line || ' '}</span>`).join('\n');
    return `<pre class="fjs-highlight fjs-highlight--${this.config.theme}" data-language="${escapeHTML(language)}"><code>${lines}</code></pre>`;
  }

  generateCSS(): string {
    return `.fjs-highlight{overflow:auto;padding:1rem;border-radius:.75rem}.fjs-highlight code{font:13px/1.6 ui-monospace,monospace}.fjs-highlight--dark{color:#e7e9ee;background:#151823}.fjs-highlight--light{color:#272437;background:#f7f5f0}.fjs-line{display:block}.fjs-line[data-line]::before{display:inline-block;width:2.5em;margin-right:1em;color:#777;text-align:right;content:attr(data-line);user-select:none}.fjs-token--keyword{color:#c9a7ff}.fjs-token--string{color:#a8e6b1}.fjs-token--number{color:#ffc98b}.fjs-token--comment{color:#7d8396;font-style:italic}.fjs-token--symbol{color:#8bd5ff}`;
  }
}

export class SyntaxHighlightPlugin {
  private readonly highlighter: SyntaxHighlighter;
  constructor(config?: SyntaxHighlightConfig) { this.highlighter = new SyntaxHighlighter(config); }
  getHighlighter(): SyntaxHighlighter { return this.highlighter; }
  getCSS(): string { return this.highlighter.generateCSS(); }
}
