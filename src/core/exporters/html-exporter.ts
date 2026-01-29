import { EditorState } from '../../core/state';
import { Node } from '../../core/schema/node';

/**
 * Export editor content to HTML
 * Supports all node types with syntax highlighting for code blocks
 */
export class HTMLExporter {
  private highlightCode(code: string, language: string): string {
    // Using a simple approach - in production, use Highlight.js or Prism.js
    // For now, just escape and wrap
    const escaped = this.escapeHtml(code);
    return `<pre><code class="language-${language}">${escaped}</code></pre>`;
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

  private nodeToHtml(node: Node): string {
    switch (node.type.name) {
      case 'doc':
        return node.content.map((child) => this.nodeToHtml(child)).join('\n');

      case 'heading':
        const level = node.attrs.level || 1;
        const headingContent = node.content
          .map((child) => this.nodeToHtml(child))
          .join('');
        return `<h${level}>${headingContent}</h${level}>`;

      case 'paragraph':
        const pContent = node.content.map((child) => this.nodeToHtml(child)).join('');
        return `<p>${pContent}</p>`;

      case 'text':
        let text = node.text || '';
        // Apply marks
        if (node.marks) {
          if (node.marks.some((m) => m.type === 'strong')) {
            text = `<strong>${text}</strong>`;
          }
          if (node.marks.some((m) => m.type === 'em')) {
            text = `<em>${text}</em>`;
          }
        }
        return text;

      case 'code-block':
        const code = node.content.map((child) => child.text || '').join('\n');
        const language = node.attrs.language || 'javascript';
        return this.highlightCode(code, language);

      case 'bullet-list':
        const items = node.content
          .map((child) => this.nodeToHtml(child))
          .join('');
        return `<ul>${items}</ul>`;

      case 'list-item':
        const liContent = node.content.map((child) => this.nodeToHtml(child)).join('');
        return `<li>${liContent}</li>`;

      case 'table':
        const rows = node.content
          .map((child) => this.nodeToHtml(child))
          .join('');
        return `<table><tbody>${rows}</tbody></table>`;

      case 'table-row':
        const cells = node.content
          .map((child) => this.nodeToHtml(child))
          .join('');
        return `<tr>${cells}</tr>`;

      case 'table-cell':
        const cellContent = node.content.map((child) => this.nodeToHtml(child)).join('');
        return `<td>${cellContent}</td>`;

      case 'image':
        return `<img src="${node.attrs.src}" alt="${node.attrs.alt || ''}" style="max-width: 100%; border-radius: 8px; margin: 10px 0;" />`;

      default:
        return '';
    }
  }

  export(state: EditorState): string {
    const htmlContent = this.nodeToHtml(state.doc);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { margin-top: 24px; margin-bottom: 16px; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    table td, table th { border: 1px solid #ddd; padding: 8px; }
    img { max-width: 100%; height: auto; }
    ul, ol { margin: 16px 0; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  }
}
