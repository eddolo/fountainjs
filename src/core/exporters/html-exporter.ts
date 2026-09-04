import type { EditorState } from '../state';
import type { Attributes, DOMOutputSpec, Node } from '../schema';
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

function renderDOMAttributes(attrs: Attributes): string {
  return Object.entries(attrs).map(([rawName, value]) => {
    const name = rawName === 'className' ? 'class' : rawName;
    if (!/^[a-z_:][a-z0-9:._-]*$/i.test(name) || /^on/i.test(name) || value === undefined || value === null || value === false) return '';
    if (name === 'href' && !isSafeURL(value)) return '';
    if (name === 'src' && !isSafeURL(value, { allowDataImage: true })) return '';
    return value === true ? ` ${name}` : ` ${name}="${escapeHTML(value)}"`;
  }).join('');
}

function renderDOMOutputSpec(spec: DOMOutputSpec, content = ''): string {
  const tuple = typeof spec === 'string' ? [spec] : spec;
  const [tagName] = tuple;
  if (!/^[a-z][a-z0-9-]*$/i.test(tagName)) return content;
  const possibleAttrs = tuple[1];
  const hasAttrs = possibleAttrs && typeof possibleAttrs === 'object' && !Array.isArray(possibleAttrs);
  const children = tuple.slice(hasAttrs ? 2 : 1).map((child) => {
    if (child === 0) return content;
    if (typeof child === 'string') return escapeHTML(child);
    return Array.isArray(child) ? renderDOMOutputSpec(child) : '';
  }).join('');
  const opening = `<${tagName}${hasAttrs ? renderDOMAttributes(possibleAttrs as Attributes) : ''}>`;
  return new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']).has(tagName.toLowerCase())
    ? opening
    : `${opening}${children}</${tagName}>`;
}

function safeSrcset(value: unknown): string {
  const source = String(value ?? '').trim();
  if (!source) return '';
  const valid = source.split(',').every((candidate) => {
    const [url, descriptor, ...rest] = candidate.trim().split(/\s+/);
    return rest.length === 0
      && isSafeURL(url)
      && (descriptor === undefined || /^(?:\d+w|\d+(?:\.\d+)?x)$/.test(descriptor));
  });
  return valid ? escapeHTML(source) : '';
}

function imageAttributes(node: Node): string {
  const src = safeURL(node.attrs.src, true);
  if (!src) return '';
  const title = node.attrs.title ? ` title="${escapeHTML(node.attrs.title)}"` : '';
  const sourceSet = safeSrcset(node.attrs.srcset);
  const srcset = sourceSet ? ` srcset="${sourceSet}"` : '';
  const sizes = node.attrs.sizes ? ` sizes="${escapeHTML(node.attrs.sizes)}"` : '';
  const loading = node.attrs.loading === 'eager' ? 'eager' : 'lazy';
  const decoding = ['auto', 'sync', 'async'].includes(String(node.attrs.decoding)) ? node.attrs.decoding : 'async';
  return `src="${src}" alt="${escapeHTML(node.attrs.alt)}"${title}${srcset}${sizes} loading="${loading}" decoding="${decoding}"`;
}

function imageSize(value: unknown, fallback: string): string {
  const size = String(value ?? '');
  return /^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh))$/.test(size) ? size : fallback;
}

function booleanAttribute(name: string, value: unknown): string {
  return value === true ? ` ${name}` : '';
}

function mediaTracks(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') return '';
    const track = candidate as Record<string, unknown>;
    const src = safeURL(track.src);
    if (!src || !['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'].includes(String(track.kind))) return '';
    const language = track.srclang ? ` srclang="${escapeHTML(track.srclang)}"` : '';
    const label = track.label ? ` label="${escapeHTML(track.label)}"` : '';
    return `<track src="${src}" kind="${escapeHTML(track.kind)}"${language}${label}${booleanAttribute('default', track.default)}>`;
  }).join('');
}

function playbackAttributes(node: Node): string {
  const src = safeURL(node.attrs.src);
  if (!src) return '';
  const title = node.attrs.title ? ` title="${escapeHTML(node.attrs.title)}"` : '';
  const preload = ['none', 'metadata', 'auto'].includes(String(node.attrs.preload)) ? node.attrs.preload : 'metadata';
  const controlsList = node.attrs.controlsList ? ` controlslist="${escapeHTML(node.attrs.controlsList)}"` : '';
  const crossOrigin = node.attrs.crossOrigin ? ` crossorigin="${escapeHTML(node.attrs.crossOrigin)}"` : '';
  return `src="${src}"${title}${booleanAttribute('controls', node.attrs.controls)}${booleanAttribute('autoplay', node.attrs.autoplay)}${booleanAttribute('loop', node.attrs.loop)}${booleanAttribute('muted', node.attrs.muted)} preload="${preload}"${controlsList}${crossOrigin}${booleanAttribute('disableremoteplayback', node.attrs.disableRemotePlayback)}`;
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
    case 'mention': case 'emoji': return node.type.spec.toDOM
      ? renderDOMOutputSpec(node.type.spec.toDOM(node), children())
      : escapeHTML(node.textContent);
    case 'math_block': return `<div class="fountain-math fountain-math--display" data-fountain-math="block" data-latex="${escapeHTML(node.attrs.latex)}" data-math-aria-label="${escapeHTML(node.attrs.ariaLabel)}" role="math" aria-label="${escapeHTML(node.attrs.ariaLabel || `Math expression: ${String(node.attrs.latex)}`)}"><code>${escapeHTML(node.attrs.latex)}</code></div>`;
    case 'inline_image': {
      const attributes = imageAttributes(node);
      if (!attributes) return '';
      const width = imageSize(node.attrs.width, 'auto');
      const height = imageSize(node.attrs.height, '1em');
      return `<img ${attributes} data-fountain-inline-image="true" style="width:${escapeHTML(width)};height:${escapeHTML(height)}">`;
    }
    case 'image_super': {
      const attributes = imageAttributes(node);
      if (!attributes) return '';
      const caption = escapeHTML(node.attrs.caption);
      const width = imageSize(node.attrs.width, '100%');
      const height = imageSize(node.attrs.height, 'auto');
      const align = ['left', 'center', 'right'].includes(String(node.attrs.align)) ? node.attrs.align : 'center';
      return `<figure data-align="${align}" style="width:${escapeHTML(width)};max-width:100%"><img ${attributes} style="width:100%;height:${escapeHTML(height)}">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'audio': {
      const attributes = playbackAttributes(node);
      if (!attributes) return '';
      const caption = escapeHTML(node.attrs.caption);
      return `<figure data-fountain-media="audio"><audio ${attributes}>${mediaTracks(node.attrs.tracks)}</audio>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'video': {
      const attributes = playbackAttributes(node);
      if (!attributes) return '';
      const poster = node.attrs.poster ? safeURL(node.attrs.poster, true) : '';
      const width = imageSize(node.attrs.width, '100%');
      const height = imageSize(node.attrs.height, 'auto');
      const align = ['left', 'center', 'right'].includes(String(node.attrs.align)) ? node.attrs.align : 'center';
      const caption = escapeHTML(node.attrs.caption);
      return `<figure data-fountain-media="video" data-align="${align}" style="width:${escapeHTML(width)};max-width:100%"><video ${attributes}${poster ? ` poster="${poster}"` : ''}${booleanAttribute('playsinline', node.attrs.playsInline)} style="width:100%;height:${escapeHTML(height)}">${mediaTracks(node.attrs.tracks)}</video>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'file_attachment': {
      const src = safeURL(node.attrs.src);
      if (!src) return '';
      const description = escapeHTML(node.attrs.description);
      const download = node.attrs.downloadName ? ` download="${escapeHTML(node.attrs.downloadName)}"` : '';
      return `<figure data-fountain-media="file"><a data-fountain-file="true" href="${src}" target="_blank" rel="noopener noreferrer" data-name="${escapeHTML(node.attrs.name)}" data-mime-type="${escapeHTML(node.attrs.mimeType)}" data-size="${Number(node.attrs.size) || 0}"${download}>${escapeHTML(node.attrs.name)}</a>${description ? `<figcaption>${description}</figcaption>` : ''}</figure>`;
    }
    case 'embed': {
      const src = safeURL(node.attrs.src);
      if (!src) return '';
      const width = imageSize(node.attrs.width, '100%');
      const height = imageSize(node.attrs.height, '360px');
      const align = ['left', 'center', 'right'].includes(String(node.attrs.align)) ? node.attrs.align : 'center';
      const caption = escapeHTML(node.attrs.caption);
      const allow = node.attrs.allow ? ` allow="${escapeHTML(node.attrs.allow)}"` : '';
      return `<figure data-fountain-media="embed" data-provider="${escapeHTML(node.attrs.provider)}" data-align="${align}" style="width:${escapeHTML(width)};max-width:100%"><iframe class="fountain-embed" src="${src}" title="${escapeHTML(node.attrs.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="${escapeHTML(node.attrs.sandbox)}"${allow}${booleanAttribute('allowfullscreen', node.attrs.allowFullscreen)} style="width:100%;height:${escapeHTML(height)}"></iframe>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'figcaption': return `<figcaption>${children()}</figcaption>`;
    case 'table': return `<table><tbody>${children()}</tbody></table>`;
    case 'table_row': return `<tr>${children()}</tr>`;
    case 'table_header': return `<th${tableCellSizeAttributes(node)} scope="${escapeHTML(node.attrs.scope || 'col')}">${children()}</th>`;
    case 'table_cell': return `<td${tableCellSizeAttributes(node)}>${children()}</td>`;
    default: return node.type.spec.toDOM ? renderDOMOutputSpec(node.type.spec.toDOM(node), children()) : children();
  }
}

const DEFAULT_STYLES = `body{max-width:760px;margin:40px auto;padding:0 20px;color:#171923;font:16px/1.7 system-ui,sans-serif}img,video,audio,iframe{max-width:100%}img{height:auto}figure{margin:1.5em 0}figcaption{color:#697386;text-align:center}.fountain-file{display:block;padding:14px;color:inherit;text-decoration:none;background:#f3f1ff;border:1px solid #ded9ff;border-radius:10px}.fountain-embed{border:0;border-radius:10px}pre{overflow:auto;padding:16px;color:#eee;background:#151823;border-radius:10px}table{width:100%;border-collapse:collapse}td,th{padding:8px 10px;border:1px solid #ddd;text-align:left}blockquote{padding-left:16px;color:#5f6673;border-left:3px solid #6d5dfc}.fountain-math{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.fountain-math--inline{display:inline-block;padding:0 .2em}.fountain-math--display{overflow:auto;margin:1em 0;padding:1em;text-align:center;background:#f6f7fa;border-radius:8px}`;

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
