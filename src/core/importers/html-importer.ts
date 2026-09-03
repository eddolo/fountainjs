import { Mark, Node as FountainNode, type Schema } from '../schema';

const SAFE_URL = /^(https?:|mailto:|tel:|data:image\/(?:png|gif|jpe?g|webp);base64,|\/|#|\.)/i;

function inlineChildren(parent: globalThis.Node, schema: Schema, marks: readonly Mark[] = []): FountainNode[] {
  const result: FountainNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      if (child.textContent) result.push(schema.text(child.textContent, marks));
      return;
    }
    if (!(child instanceof HTMLElement)) return;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br' && schema.nodes.hard_break) { result.push(schema.node('hard_break')); return; }
    if (child.getAttribute('data-fountain-math') === 'inline' && schema.nodes.inline_math) {
      const latex = child.getAttribute('data-latex') ?? child.textContent ?? '';
      const ariaLabel = child.getAttribute('data-math-aria-label') ?? '';
      try { result.push(schema.node('inline_math', { latex, ariaLabel })); }
      catch { if (latex) result.push(schema.text(latex, marks)); }
      return;
    }
    let nextMarks = [...marks];
    const markName = ({ strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'underline', s: 'strike', del: 'strike', code: 'code', mark: 'highlight', sub: 'subscript', sup: 'superscript' } as Record<string, string>)[tag];
    if (markName && schema.marks[markName]) nextMarks.push(schema.mark(markName));
    const color = /(?:^|;)\s*color\s*:\s*(#[\da-f]{6})(?:\s*;|$)/i.exec(child.getAttribute('style') ?? '')?.[1];
    if (color && schema.marks.text_color && /^#[\da-f]{6}$/i.test(color)) nextMarks.push(schema.mark('text_color', { color }));
    if (tag === 'a' && schema.marks.link) {
      const href = child.getAttribute('href') ?? '';
      const anchor = child as HTMLAnchorElement;
      if (SAFE_URL.test(href)) nextMarks.push(schema.mark('link', { href, title: anchor.title, target: anchor.target || '_blank' }));
    }
    result.push(...inlineChildren(child, schema, nextMarks));
  });
  return result;
}

function alignment(element: Element): 'left' | 'center' | 'right' | 'justify' {
  const value = (element as HTMLElement).style.textAlign || element.getAttribute('align') || 'left';
  return ['left', 'center', 'right', 'justify'].includes(value) ? value as 'left' | 'center' | 'right' | 'justify' : 'left';
}

function paragraph(element: Element, schema: Schema): FountainNode {
  const content = inlineChildren(element, schema);
  return schema.node('paragraph', { align: alignment(element) }, content.length ? content : [schema.text('')]);
}

function block(element: Element, schema: Schema): FountainNode[] {
  const tag = element.tagName.toLowerCase();
  if (element.getAttribute('data-fountain-math') === 'block' && schema.nodes.math_block) {
    const latex = element.getAttribute('data-latex') ?? element.textContent ?? '';
    const ariaLabel = element.getAttribute('data-math-aria-label') ?? '';
    try { return [schema.node('math_block', { latex, ariaLabel })]; }
    catch { return latex ? [schema.node('paragraph', {}, [schema.text(latex)])] : []; }
  }
  if (/^h[1-6]$/.test(tag)) return [schema.node('heading', { level: Number(tag[1]), align: alignment(element) }, inlineChildren(element, schema))];
  if (tag === 'p') return [paragraph(element, schema)];
  if (tag === 'blockquote') {
    const children = Array.from(element.children).flatMap((child) => block(child, schema));
    return [schema.node('blockquote', {}, children.length ? children : [paragraph(element, schema)])];
  }
  if (tag === 'pre') return [schema.node('code_block', {
    language: element.getAttribute('data-language') || element.querySelector('code')?.className.match(/language-([\w-]+)/)?.[1] || 'text',
    lineNumbers: true,
  }, [schema.text(element.textContent ?? '')])];
  if (tag === 'hr') return [schema.node('horizontal_rule')];
  if (tag === 'ul' || tag === 'ol') {
    const isTask = element.getAttribute('data-type') === 'task-list';
    const itemType = isTask ? 'task_item' : 'list_item';
    const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li').map((item) => {
      const children = Array.from(item.children).filter((child) => child.tagName.toLowerCase() !== 'input').flatMap((child) => block(child, schema));
      const content = children.length ? children : [paragraph(item, schema)];
      return schema.node(itemType, isTask ? { checked: item.getAttribute('data-checked') === 'true' || item.querySelector('input')?.checked === true } : {}, content);
    });
    const listType = isTask ? 'task_list' : tag === 'ol' ? 'ordered_list' : 'bullet_list';
    return [schema.node(listType, tag === 'ol' ? { start: Number(element.getAttribute('start')) || 1 } : {}, items)];
  }
  if (tag === 'figure') {
    const image = element.querySelector('img');
    const src = image?.getAttribute('src') ?? '';
    if (!image || !SAFE_URL.test(src)) return [];
    return [schema.node('image_super', {
      src, alt: image.alt, title: image.title, width: '100%', caption: element.querySelector('figcaption')?.textContent ?? '',
    })];
  }
  if (tag === 'table') {
    const rows = Array.from(element.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')).map((row) => schema.node('table_row', {},
      Array.from(row.children).filter((cell) => /^(td|th)$/i.test(cell.tagName)).map((cell) => schema.node(
        cell.tagName.toLowerCase() === 'th' ? 'table_header' : 'table_cell',
        { colspan: Number(cell.getAttribute('colspan')) || 1, rowspan: Number(cell.getAttribute('rowspan')) || 1 },
        [paragraph(cell, schema)],
      )),
    ));
    return rows.length ? [schema.node('table', {}, rows)] : [];
  }
  if (tag === 'img') {
    const src = element.getAttribute('src') ?? '';
    return SAFE_URL.test(src) ? [schema.node('image_super', { src, alt: element.getAttribute('alt') ?? '', title: element.getAttribute('title') ?? '', width: '100%', caption: '' })] : [];
  }
  const nested = Array.from(element.children).flatMap((child) => block(child, schema));
  return nested.length ? nested : [paragraph(element, schema)];
}

export class HTMLImporter {
  parse(html: string, schema: Schema): FountainNode {
    if (typeof DOMParser === 'undefined') throw new Error('HTMLImporter requires a browser DOMParser (or a DOM shim in Node.js).');
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    const blocks = Array.from(body.children).flatMap((element) => block(element, schema));
    if (!blocks.length && body.textContent) blocks.push(schema.node('paragraph', {}, [schema.text(body.textContent)]));
    return schema.topNodeType.create({}, blocks.length ? blocks : [schema.node('paragraph', {}, [schema.text('')])]);
  }

  static parse(html: string, schema: Schema): FountainNode { return new HTMLImporter().parse(html, schema); }
}
