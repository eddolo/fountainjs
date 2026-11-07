import { parseMathExpressionJSON } from '../math-expression';
import { readParagraphLayout } from '../paragraph-layout';
import type { Mark, Node, Schema } from '../schema';
import { isSafeURL } from '../url';
import { textNodes, unicodeEmojiName } from './html-marks';

interface AtomElement {
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(selector: string): Pick<AtomElement, 'getAttribute'> | null;
}

export function projectHTMLMath(
  element: AtomElement, schema: Schema, kind: 'inline' | 'block',
  marks: readonly Mark[] = [], fallbackMarks: readonly Mark[] = marks,
): Node[] | undefined {
  const type = kind === 'inline' ? 'inline_math' : 'math_block';
  if (element.getAttribute('data-fountain-math') !== kind || !schema.nodes[type]) return undefined;
  const latex = element.getAttribute('data-latex') ?? element.textContent ?? '';
  const ariaLabel = element.getAttribute('data-math-aria-label') ?? '';
  const expression = parseMathExpressionJSON(element.getAttribute('data-fountain-math-expression'));
  try {
    return [schema.node(type, { latex, ariaLabel, expression, ...(kind === 'block' ? readParagraphLayout(element) : {}) }, [], undefined, marks)];
  } catch {
    if (!latex) return [];
    const text = schema.text(latex, fallbackMarks);
    return kind === 'inline' ? [text] : [schema.node('paragraph', {}, [text])];
  }
}

export function projectHTMLInlineAtom(
  element: AtomElement, schema: Schema, marks: readonly Mark[], fallbackMarks: readonly Mark[] = marks,
): Node[] | undefined {
  const math = projectHTMLMath(element, schema, 'inline', marks, fallbackMarks);
  if (math) return math;
  if (element.hasAttribute('data-fountain-mention') && schema.nodes.mention) {
    const id = element.getAttribute('data-id') ?? '';
    const href = element.getAttribute('href') ?? '';
    try {
      return [schema.node('mention', {
        id,
        label: element.getAttribute('data-label') ?? '',
        trigger: element.getAttribute('data-trigger') ?? '@',
        kind: element.getAttribute('data-kind') ?? 'mention',
        href: href && isSafeURL(href) ? href : '',
      }, [], undefined, marks)];
    } catch { return textNodes(element.textContent ?? '', schema, fallbackMarks); }
  }
  if (element.hasAttribute('data-fountain-emoji') && schema.nodes.emoji) {
    const emoji = element.getAttribute('data-emoji') ?? '';
    const fallback = element.getAttribute('data-fallback-image') ?? element.querySelector('img')?.getAttribute('src') ?? '';
    try {
      return [schema.node('emoji', {
        name: element.getAttribute('data-name') ?? unicodeEmojiName(emoji),
        emoji,
        fallbackImage: fallback && isSafeURL(fallback, { allowDataImage: true }) ? fallback : '',
      }, [], undefined, marks)];
    } catch { return textNodes(emoji || element.textContent || '', schema, fallbackMarks); }
  }
  return undefined;
}
