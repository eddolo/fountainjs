import { matchesContentExpression } from '../schema/content-expression';
import type { Attributes, DOMParseRule, HTMLParseElement, HTMLParseRule, Mark, MarkType, Node, NodeType, Schema } from '../schema';
import { relativeHTMLContent } from './html-marks';

export type HTMLImportRule = HTMLParseRule | DOMParseRule;

export const HTML_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dt', 'dd', 'fieldset',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'img', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'ul', 'audio', 'video', 'iframe',
]);

function isSharedDOMRule(portable: readonly HTMLParseRule[] | undefined, rule: DOMParseRule) {
  return portable?.some(candidate => Object.is(candidate, rule));
}

export function hasHTMLRule(spec: NodeType['spec'], matches: (rule: HTMLImportRule) => boolean): boolean {
  return Boolean(spec.parseHTML?.some(matches) || spec.parseDOM?.some(rule => (
    !isSharedDOMRule(spec.parseHTML, rule) && matches(rule)
  )));
}

export function matchingHTMLRules<Type extends MarkType | NodeType>(
  types: Readonly<Record<string, Type>>,
  matches: (rule: HTMLImportRule, type: Type) => boolean,
  include?: (type: Type) => boolean,
) {
  const results: Array<{ type: Type; rule: HTMLImportRule; portable: boolean }> = [];
  for (const type of Object.values(types)) {
    if (include && !include(type)) continue;
    const { parseHTML, parseDOM } = type.spec;
    for (const rule of parseHTML ?? []) {
      if (matches(rule, type)) results.push({ type, rule, portable: true });
    }
    for (const rule of parseDOM ?? []) {
      // One object can be registered for both environments. A decline should
      // advance to a distinct rule instead of retrying that same reader.
      if (isSharedDOMRule(parseHTML, rule)) continue;
      if (matches(rule, type)) results.push({ type, rule, portable: false });
    }
  }
  // Stable sort keeps schema order and portable-before-DOM ties.
  const priority = (rule: HTMLImportRule) => Number.isFinite(rule.priority) ? Number(rule.priority) : 50;
  return results.sort((left, right) => priority(right.rule) - priority(left.rule));
}

export function readHTMLRuleAttributes(
  element: HTMLElement | HTMLParseElement,
  rule: HTMLImportRule,
  report?: (reason: string) => void,
): Attributes | false {
  try {
    const reader = rule.getAttrs as ((candidate: typeof element) => Attributes | null | false) | undefined;
    const value = reader?.(element) ?? {};
    if (value === false) return false;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype === Object.prototype || prototype === null) return value;
    }
  } catch {
    report?.('attribute reader threw an exception');
    return false;
  }
  report?.('attribute reader did not return a plain attribute object');
  return false;
}

export function createHTMLRuleNode(type: NodeType, attrs: Attributes, content: readonly Node[], marks: readonly Mark[], schema: Schema): Node | null {
  if (type.spec.content && !matchesContentExpression(content, type.spec.content)) return null;
  try {
    const node = type.create(attrs, content, undefined, marks);
    schema.validate(node);
    return node;
  } catch { return null; }
}

export function projectHTMLRuby(type: NodeType, annotation: string, base: Node[], marks: readonly Mark[], schema: Schema): Node[] {
  if (!annotation || !base.length || base.some(node => !node.isText)) return base;
  const ruby = createHTMLRuleNode(type, { rt: annotation }, relativeHTMLContent(base, marks), marks, schema);
  return ruby ? [ruby] : base;
}
