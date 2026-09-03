import type { EditorState } from '../state';
import type { Node } from '../schema';

function escapeInline(text: string): string { return text.replace(/([\\`*_[\]<>])/g, '\\$1'); }

function inline(node: Node): string {
  if (!node.isText) {
    if (node.type.name === 'hard_break') return '  \n';
    if (node.type.name === 'inline_math') return `$${String(node.attrs.latex ?? '')}$`;
    if (node.type.name === 'inline_image') return `![${String(node.attrs.alt ?? '')}](${String(node.attrs.src ?? '')}${node.attrs.title ? ` "${String(node.attrs.title)}"` : ''})`;
    return node.content.map(inline).join('');
  }
  let text = node.marks.some((mark) => mark.type.name === 'code') ? `\`${(node.text ?? '').replace(/`/g, '\\`')}\`` : escapeInline(node.text ?? '');
  for (const mark of node.marks.filter((item) => item.type.name !== 'code')) {
    if (mark.type.name === 'strong') text = `**${text}**`;
    else if (mark.type.name === 'em') text = `_${text}_`;
    else if (mark.type.name === 'strike') text = `~~${text}~~`;
    else if (mark.type.name === 'link') text = `[${text}](${String(mark.attrs.href ?? '')})`;
    else if (mark.type.name === 'highlight') text = `==${text}==`;
  }
  return text;
}

function render(node: Node, depth = 0): string {
  const children = () => node.content.map((child) => render(child, depth)).join('');
  switch (node.type.name) {
    case 'doc': return node.content.map((child) => render(child)).join('\n\n').replace(/\n{3,}/g, '\n\n');
    case 'text': return inline(node);
    case 'paragraph': return node.content.map(inline).join('');
    case 'heading': return `${'#'.repeat(Number(node.attrs.level) || 1)} ${node.content.map(inline).join('')}`;
    case 'blockquote': return children().split('\n').map((line) => `> ${line}`).join('\n');
    case 'bullet_list': return node.content.map((child) => `${'  '.repeat(depth)}- ${render(child, depth + 1)}`).join('\n');
    case 'ordered_list': return node.content.map((child, index) => `${'  '.repeat(depth)}${(Number(node.attrs.start) || 1) + index}. ${render(child, depth + 1)}`).join('\n');
    case 'task_list': return node.content.map((child) => `${'  '.repeat(depth)}- [${child.attrs.checked ? 'x' : ' '}] ${render(child, depth + 1)}`).join('\n');
    case 'list_item': case 'task_item': return node.content.map((child, index) => {
      const value = render(child, depth);
      const nestedList = ['bullet_list', 'ordered_list', 'task_list'].includes(child.type.name);
      return index > 0 && !nestedList ? `${'  '.repeat(depth)}${value}` : value;
    }).join('\n');
    case 'code_block': return `\`\`\`${String(node.attrs.language ?? '')}\n${node.textContent}\n\`\`\``;
    case 'horizontal_rule': return '---';
    case 'hard_break': return '  \n';
    case 'math_block': return `$$\n${String(node.attrs.latex ?? '')}\n$$`;
    case 'image_super': return `![${String(node.attrs.alt ?? '')}](${String(node.attrs.src ?? '')}${node.attrs.title ? ` "${String(node.attrs.title)}"` : ''})${node.attrs.caption ? `\n_${String(node.attrs.caption)}_` : ''}`;
    case 'table': {
      return node.content.map((row, rowIndex) => {
        const cells = row.content.map((cell) => cell.content.map((child) => render(child, depth)).join(' ').replace(/\|/g, '\\|'));
        return `| ${cells.join(' | ')} |${rowIndex === 0 ? `\n| ${cells.map(() => '---').join(' | ')} |` : ''}`;
      }).join('\n');
    }
    case 'table_row': case 'table_header': case 'table_cell': case 'figcaption': return children();
    default: return children();
  }
}

export class MarkdownExporter {
  export(stateOrNode: EditorState | Node): string {
    const node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    return render(node).trimEnd();
  }

  static export(stateOrNode: EditorState | Node): string { return new MarkdownExporter().export(stateOrNode); }
}
