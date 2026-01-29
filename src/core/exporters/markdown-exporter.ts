import { EditorState } from '../../core/state';
import { Node } from '../../core/schema/node';

/**
 * Export editor content to Markdown
 * Preserves all formatting and supports code blocks
 */
export class MarkdownExporter {
  private nodeToMarkdown(node: Node, depth: number = 0): string {
    const indent = '  '.repeat(depth);

    switch (node.type.name) {
      case 'doc':
        return node.content.map((child) => this.nodeToMarkdown(child, depth)).join('\n\n');

      case 'heading':
        const level = node.attrs.level || 1;
        const headingContent = node.content
          .map((child) => this.nodeToMarkdown(child, depth))
          .join('');
        return `${'#'.repeat(level)} ${headingContent}`;

      case 'paragraph':
        return node.content.map((child) => this.nodeToMarkdown(child, depth)).join('');

      case 'text':
        let text = node.text || '';
        // Apply marks
        if (node.marks) {
          if (node.marks.some((m) => m.type === 'strong')) {
            text = `**${text}**`;
          }
          if (node.marks.some((m) => m.type === 'em')) {
            text = `*${text}*`;
          }
        }
        return text;

      case 'code-block':
        const code = node.content.map((child) => child.text || '').join('\n');
        const language = node.attrs.language || '';
        return `\`\`\`${language}\n${code}\n\`\`\``;

      case 'bullet-list':
        return node.content
          .map((child) => {
            const content = this.nodeToMarkdown(child, depth + 1);
            return `${indent}- ${content}`;
          })
          .join('\n');

      case 'list-item':
        return node.content.map((child) => this.nodeToMarkdown(child, depth)).join('');

      case 'table':
        let table = '';
        const rows = node.content as Node[];
        rows.forEach((row, rowIdx) => {
          const cells = (row.content as Node[])
            .map((cell) => this.nodeToMarkdown(cell, depth))
            .join(' | ');
          table += `| ${cells} |\n`;
          if (rowIdx === 0) {
            table += `| ${cells.split(' | ').map(() => '---').join(' | ')} |\n`;
          }
        });
        return table;

      case 'table-cell':
        return node.content.map((child) => this.nodeToMarkdown(child, depth)).join('');

      case 'image':
        return `![${node.attrs.alt || 'image'}](${node.attrs.src})`;

      default:
        return '';
    }
  }

  export(state: EditorState): string {
    return this.nodeToMarkdown(state.doc);
  }
}
