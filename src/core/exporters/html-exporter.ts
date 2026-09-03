import type { EditorState } from '../state';
import type { Node } from '../schema';
import { isSafeURL } from '../url';

export interface HTMLExportOptions {
  document?: boolean;
  title?: string;
  includeStyles?: boolean;
}

function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function safeURL(value: unknown, allowDataImage = false): string {
  const url = String(value ?? '').trim();
  return isSafeURL(url, { allowDataImage }) ? escapeHTML(url) : '';
}

function tableCellSizeAttributes(node: Node): string {
  const colspan = Number(node.attrs.colspan) || 1;
  const widths = Array.isArray(node.attrs.colwidth) ? node.attrs.colwidth.map(Number) : [];
  const valid = widths.length === colspan && widths.every((width) => Number.isInteger(width) && width >= 40 && width <= 2_000);
  return ` colspan="${colspan}" rowspan="${Number(node.attrs.rowspan) || 1}"${valid ? ` data-colwidth="${widths.join(',')}" style="width:${widths.reduce((sum, width) => sum + width, 0)}px"` : ''}`;
}

function renderText(node: Node): string {
  let content = escapeHTML(node.text);
  for (const mark of node.marks) {
    switch (mark.type.name) {
      case 'strong': content = `<strong>${content}</strong>`; break;
      case 'em': content = `<em>${content}</em>`; break;
      case 'underline': content = `<u>${content}</u>`; break;
      case 'strike': content = `<s>${content}</s>`; break;
      case 'code': content = `<code>${content}</code>`; break;
      case 'highlight': content = `<mark style="background-color:${escapeHTML(mark.attrs.color)}">${content}</mark>`; break;
      case 'text_color': content = `<span style="color:${escapeHTML(mark.attrs.color)}">${content}</span>`; break;
      case 'subscript': content = `<sub>${content}</sub>`; break;
      case 'superscript': content = `<sup>${content}</sup>`; break;
      case 'link': {
        const href = safeURL(mark.attrs.href);
        content = href ? `<a href="${href}" rel="noopener noreferrer nofollow">${content}</a>` : content;
        break;
      }
    }
  }
  return content;
}

function renderNode(node: Node): string {
  if (node.isText) return renderText(node);
  const children = () => node.content.map(renderNode).join('');
  switch (node.type.name) {
    case 'doc': return node.content.map(renderNode).join('\n');
    case 'paragraph': return `<p${node.attrs.align !== 'left' ? ` style="text-align:${escapeHTML(node.attrs.align)}"` : ''}>${children()}</p>`;
    case 'heading': return `<h${Number(node.attrs.level) || 1}${node.attrs.align !== 'left' ? ` style="text-align:${escapeHTML(node.attrs.align)}"` : ''}>${children()}</h${Number(node.attrs.level) || 1}>`;
    case 'blockquote': return `<blockquote>${children()}</blockquote>`;
    case 'bullet_list': return `<ul>${children()}</ul>`;
    case 'ordered_list': return `<ol${Number(node.attrs.start) !== 1 ? ` start="${Number(node.attrs.start) || 1}"` : ''}>${children()}</ol>`;
    case 'list_item': return `<li>${children()}</li>`;
    case 'task_list': return `<ul data-type="task-list">${children()}</ul>`;
    case 'task_item': return `<li data-type="task-item" data-checked="${Boolean(node.attrs.checked)}"><input type="checkbox" disabled${node.attrs.checked ? ' checked' : ''}>${children()}</li>`;
    case 'code_block': return `<pre data-language="${escapeHTML(node.attrs.language)}"><code class="language-${escapeHTML(node.attrs.language)}">${escapeHTML(node.textContent)}</code></pre>`;
    case 'horizontal_rule': return '<hr>';
    case 'hard_break': return '<br>';
    case 'inline_math': return `<span class="fountain-math fountain-math--inline" data-fountain-math="inline" data-latex="${escapeHTML(node.attrs.latex)}" data-math-aria-label="${escapeHTML(node.attrs.ariaLabel)}" role="math" aria-label="${escapeHTML(node.attrs.ariaLabel || `Math expression: ${String(node.attrs.latex)}`)}"><code>${escapeHTML(node.attrs.latex)}</code></span>`;
    case 'math_block': return `<div class="fountain-math fountain-math--display" data-fountain-math="block" data-latex="${escapeHTML(node.attrs.latex)}" data-math-aria-label="${escapeHTML(node.attrs.ariaLabel)}" role="math" aria-label="${escapeHTML(node.attrs.ariaLabel || `Math expression: ${String(node.attrs.latex)}`)}"><code>${escapeHTML(node.attrs.latex)}</code></div>`;
    case 'image_super': {
      const src = safeURL(node.attrs.src, true);
      if (!src) return '';
      const caption = escapeHTML(node.attrs.caption);
      const width = /^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw))$/.test(String(node.attrs.width)) ? String(node.attrs.width) : '100%';
      return `<figure style="max-width:${escapeHTML(width)}"><img src="${src}" alt="${escapeHTML(node.attrs.alt)}"${node.attrs.title ? ` title="${escapeHTML(node.attrs.title)}"` : ''} loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'figcaption': return `<figcaption>${children()}</figcaption>`;
    case 'table': return `<table><tbody>${children()}</tbody></table>`;
    case 'table_row': return `<tr>${children()}</tr>`;
    case 'table_header': return `<th${tableCellSizeAttributes(node)} scope="${escapeHTML(node.attrs.scope || 'col')}">${children()}</th>`;
    case 'table_cell': return `<td${tableCellSizeAttributes(node)}>${children()}</td>`;
    default: return children();
  }
}

const DEFAULT_STYLES = `body{max-width:760px;margin:40px auto;padding:0 20px;color:#171923;font:16px/1.7 system-ui,sans-serif}img{max-width:100%;height:auto}pre{overflow:auto;padding:16px;color:#eee;background:#151823;border-radius:10px}table{width:100%;border-collapse:collapse}td,th{padding:8px 10px;border:1px solid #ddd;text-align:left}blockquote{padding-left:16px;color:#5f6673;border-left:3px solid #6d5dfc}.fountain-math{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.fountain-math--inline{display:inline-block;padding:0 .2em}.fountain-math--display{overflow:auto;margin:1em 0;padding:1em;text-align:center;background:#f6f7fa;border-radius:8px}`;

export class HTMLExporter {
  export(stateOrNode: EditorState | Node, options: HTMLExportOptions = {}): string {
    const node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    const fragment = renderNode(node);
    if (options.document === false) return fragment;
    const title = escapeHTML(options.title ?? 'FountainJS document');
    const styles = options.includeStyles === false ? '' : `<style>${DEFAULT_STYLES}</style>`;
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n${styles}\n</head>\n<body>\n${fragment}\n</body>\n</html>`;
  }

  static export(stateOrNode: EditorState | Node, options?: HTMLExportOptions): string {
    return new HTMLExporter().export(stateOrNode, options);
  }
}
