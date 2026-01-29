/**
 * Syntax Highlighting Plugin for FountainJS
 * Language-agnostic: supports all programming languages
 * Uses Highlight.js under the hood
 */

export interface SyntaxHighlightConfig {
  theme?: 'default' | 'dark' | 'light' | 'custom';
  lineNumbers?: boolean;
  lineHighlight?: boolean;
  customTheme?: string;
}

/**
 * Simplified syntax highlighting
 * For production, use Highlight.js or Prism.js
 */
export class SyntaxHighlighter {
  private config: SyntaxHighlightConfig;
  private languageMap: { [key: string]: string } = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'php': 'php',
    'swift': 'swift',
    'kotlin': 'kotlin',
    'sql': 'sql',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'bash': 'bash',
    'sh': 'bash',
    'r': 'r',
    'matlab': 'matlab',
    'scala': 'scala',
  };

  constructor(config: SyntaxHighlightConfig = {}) {
    this.config = {
      theme: 'default',
      lineNumbers: true,
      ...config,
    };
  }

  /**
   * Highlight code in a given language
   */
  highlight(code: string, language: string): string {
    const normalizedLang = this.normalizeLanguage(language);

    // Add theme class
    const themeClass = `hljs-${this.config.theme}`;

    // Add line numbers if enabled
    let highlighted = code;
    if (this.config.lineNumbers) {
      highlighted = this.addLineNumbers(code);
    }

    // Escape HTML
    highlighted = this.escapeHtml(highlighted);

    // Return as pre/code block with language class
    return `<pre class="${themeClass}"><code class="language-${normalizedLang} hljs">${highlighted}</code></pre>`;
  }

  /**
   * Generate CSS for syntax highlighting
   */
  generateCSS(): string {
    // Default minimal CSS for syntax highlighting
    return `
.hljs {
  display: block;
  overflow-x: auto;
  padding: 0.5em;
  color: #333;
  background: #f5f5f5;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-literal {
  color: #0077aa;
}

.hljs-string {
  color: #669900;
}

.hljs-number {
  color: #924900;
}

.hljs-attr,
.hljs-attribute {
  color: #d19a66;
}

.hljs-comment {
  color: #aaa;
}

.hljs-function .hljs-title {
  color: #dd4814;
}

.hljs-class .hljs-title {
  color: #dd4814;
}

.hljs-dark {
  background: #1e1e1e;
  color: #d4d4d4;
}

.hljs-dark .hljs-keyword,
.hljs-dark .hljs-selector-tag {
  color: #569cd6;
}

.hljs-dark .hljs-string {
  color: #ce9178;
}

.hljs-dark .hljs-number {
  color: #b5cea8;
}

.hljs-dark .hljs-comment {
  color: #6a9955;
}

.line-number {
  display: inline-block;
  width: 50px;
  text-align: right;
  padding-right: 10px;
  margin-right: 10px;
  border-right: 1px solid #ddd;
  color: #999;
  user-select: none;
}
    `;
  }

  private normalizeLanguage(language: string): string {
    const lower = language.toLowerCase();
    return this.languageMap[lower] || lower;
  }

  private addLineNumbers(code: string): string {
    const lines = code.split('\n');
    return lines
      .map((line, idx) => `<span class="line-number">${idx + 1}</span>${line}`)
      .join('\n');
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}

/**
 * Plugin for integrating syntax highlighting into FountainJS
 */
export class SyntaxHighlightPlugin {
  private highlighter: SyntaxHighlighter;

  constructor(config?: SyntaxHighlightConfig) {
    this.highlighter = new SyntaxHighlighter(config);
  }

  /**
   * Get the highlighter instance
   */
  getHighlighter(): SyntaxHighlighter {
    return this.highlighter;
  }

  /**
   * Get CSS for syntax highlighting
   */
  getCSS(): string {
    return this.highlighter.generateCSS();
  }
}
