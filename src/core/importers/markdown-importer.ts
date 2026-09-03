import { Mark, Node, type Schema } from '../schema';
import { isSafeURL } from '../url';

function inline(text: string, schema: Schema): Node[] {
  const result: Node[] = [];
  const pattern = /(\$(?!\$)(?!\s)(?:\\.|[^$\\\n])*(?<!\s)\$|\*\*[^*]+\*\*|~~[^~]+~~|==[^=]+==|`[^`]+`|\[[^\]]+\]\([^)]+\)|_[^_]+_)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(schema.text(text.slice(cursor, index)));
    const token = match[0];
    let value = token;
    let mark: Mark | undefined;
    if (token.startsWith('$') && schema.nodes.inline_math) {
      const latex = token.slice(1, -1);
      try { result.push(schema.node('inline_math', { latex, ariaLabel: '' })); }
      catch { result.push(schema.text(token)); }
      cursor = index + token.length;
      continue;
    }
    if (token.startsWith('**')) { value = token.slice(2, -2); mark = schema.marks.strong?.create(); }
    else if (token.startsWith('~~')) { value = token.slice(2, -2); mark = schema.marks.strike?.create(); }
    else if (token.startsWith('`')) { value = token.slice(1, -1); mark = schema.marks.code?.create(); }
    else if (token.startsWith('==')) { value = token.slice(2, -2); mark = schema.marks.highlight?.create(); }
    else if (token.startsWith('_')) { value = token.slice(1, -1); mark = schema.marks.em?.create(); }
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        value = link[1];
        if (isSafeURL(link[2].trim())) mark = schema.marks.link?.create({ href: link[2].trim() });
      }
    }
    result.push(schema.text(value, mark ? [mark] : []));
    cursor = index + token.length;
  }
  if (cursor < text.length) result.push(schema.text(text.slice(cursor)));
  return result.length ? result : [schema.text('')];
}

function paragraph(schema: Schema, value: string): Node { return schema.node('paragraph', {}, inline(value, schema)); }

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

export class MarkdownImporter {
  parse(markdown: string, schema: Schema): Node {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Node[] = [];
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }
      const fence = /^```([^\s]*)\s*$/.exec(line);
      if (fence) {
        const code: string[] = [];
        for (index++; index < lines.length && !/^```\s*$/.test(lines[index]); index++) code.push(lines[index]);
        index++;
        blocks.push(schema.node('code_block', { language: fence[1] || 'text', lineNumbers: true }, [schema.text(code.join('\n'))]));
        continue;
      }
      if (schema.nodes.math_block && /^\$\$/.test(line)) {
        const singleLine = /^\$\$(.+)\$\$$/.exec(line);
        if (singleLine) {
          blocks.push(schema.node('math_block', { latex: singleLine[1], ariaLabel: '' }));
          index++;
          continue;
        }
        if (/^\$\$\s*$/.test(line)) {
          const closing = lines.findIndex((candidate, candidateIndex) => (
            candidateIndex > index && /^\$\$\s*$/.test(candidate)
          ));
          if (closing > index) {
            const latex = lines.slice(index + 1, closing).join('\n');
            blocks.push(schema.node('math_block', { latex, ariaLabel: '' }));
            index = closing + 1;
            continue;
          }
        }
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) { blocks.push(schema.node('heading', { level: heading[1].length }, inline(heading[2], schema))); index++; continue; }
      if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push(schema.node('horizontal_rule')); index++; continue; }
      const image = /^!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)\s*$/.exec(line);
      if (image && /^(https?:|data:image\/(?:png|gif|jpe?g|webp);base64,|\/|\.|#)/i.test(image[2])) {
        blocks.push(schema.node('image_super', {
          src: image[2], alt: image[1], title: image[3] ?? '', width: '100%', caption: '',
        }));
        index++;
        continue;
      }
      if (/^\|?.+\|.+\|?\s*$/.test(line) && index + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[index + 1])) {
        const rows: Node[] = [];
        const headers = tableCells(line);
        rows.push(schema.node('table_row', {}, headers.map((value) => schema.node('table_header', {}, [paragraph(schema, value)]))));
        index += 2;
        while (index < lines.length && /^\|?.+\|.+\|?\s*$/.test(lines[index])) {
          rows.push(schema.node('table_row', {}, tableCells(lines[index]).map((value) => schema.node('table_cell', {}, [paragraph(schema, value)]))));
          index++;
        }
        blocks.push(schema.node('table', {}, rows));
        continue;
      }
      if (/^>\s?/.test(line)) {
        const quote: string[] = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
        blocks.push(schema.node('blockquote', {}, [paragraph(schema, quote.join('\n'))]));
        continue;
      }
      if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
        const items: Node[] = [];
        while (index < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[index])) {
          const match = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[index++]);
          items.push(schema.node('task_item', { checked: match?.[1].toLowerCase() === 'x' }, [paragraph(schema, match?.[2] ?? '')]));
        }
        blocks.push(schema.node('task_list', {}, items));
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        const items: Node[] = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
          const value = lines[index++].replace(/^[-*]\s+/, '');
          items.push(schema.node('list_item', {}, [paragraph(schema, value)]));
        }
        blocks.push(schema.node('bullet_list', {}, items));
        continue;
      }
      if (/^\d+[.)]\s+/.test(line)) {
        const start = Number(/^\d+/.exec(line)?.[0] ?? 1);
        const items: Node[] = [];
        while (index < lines.length && /^\d+[.)]\s+/.test(lines[index])) {
          items.push(schema.node('list_item', {}, [paragraph(schema, lines[index++].replace(/^\d+[.)]\s+/, ''))]));
        }
        blocks.push(schema.node('ordered_list', { start }, items));
        continue;
      }
      const paragraphLines = [line];
      for (index++; index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|```|>|[-*]\s+|\d+[.)]\s+)/.test(lines[index]); index++) paragraphLines.push(lines[index]);
      blocks.push(paragraph(schema, paragraphLines.join(' ')));
    }
    return schema.topNodeType.create({}, blocks.length ? blocks : [paragraph(schema, '')]);
  }

  static parse(markdown: string, schema: Schema): Node { return new MarkdownImporter().parse(markdown, schema); }
}
