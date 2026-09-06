import {
  Node,
  Plugin,
  type Attributes,
  type Editor,
  type EditorState,
  type Mark,
  type Transaction,
} from '../../core';
import { insertDocument, insertPlainText } from '../../core/commands';

export interface PasteRuleContext {
  readonly editor: Editor;
  readonly state: EditorState;
  readonly event: ClipboardEvent;
  readonly text: string;
  readonly html: string;
  readonly matches: readonly RegExpExecArray[];
}

export type PasteRuleResult = Transaction | Node | string | true | null | false;
export type PasteRuleHandler = (context: PasteRuleContext) => PasteRuleResult;

/** A clipboard rule matched against the complete plain-text representation. */
export class PasteRule {
  constructor(
    public readonly find: RegExp,
    public readonly handler: PasteRuleHandler,
    public readonly name = find.source,
  ) {
    if (!(find instanceof RegExp)) throw new TypeError('Paste rules require a regular expression.');
    if (typeof handler !== 'function') throw new TypeError('Paste rules require a handler.');
  }
}

export interface PasteRulesConfig {
  readonly rules: readonly PasteRule[];
}

function globalExpression(expression: RegExp): RegExp {
  const flags = expression.flags.includes('g') ? expression.flags : `${expression.flags}g`;
  return new RegExp(expression.source, flags.replace(/y/g, ''));
}

function findMatches(expression: RegExp, text: string): RegExpExecArray[] {
  return [...text.matchAll(globalExpression(expression))];
}

/** Applies the first matching paste rule before the view's normal HTML/text importer. */
export function pasteRulesPlugin(config: PasteRulesConfig): Plugin {
  const rules = Object.freeze([...config.rules]);
  return new Plugin({
    props: {
      handlePaste: (editor, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const html = event.clipboardData?.getData('text/html') ?? '';
        // A structured clipboard representation is the higher-fidelity source.
        // Plain-text rules must not silently discard its marks, links, tables,
        // annotations, or extension-defined nodes.
        if (html.trim()) return false;
        for (const rule of rules) {
          const matches = findMatches(rule.find, text);
          if (!matches.length) continue;
          const result = rule.handler({ editor, state: editor.state, event, text, html, matches });
          if (result === null || result === false) continue;
          if (result instanceof Node) return editor.runCommandBatch(() => insertDocument(editor, result));
          if (typeof result === 'string') {
            return result === '' || editor.runCommandBatch(() => insertPlainText(editor, result));
          }
          if (result === true) return true;
          editor.dispatch(result);
          return true;
        }
        return false;
      },
    },
  });
}

export interface TextPasteRuleConfig {
  readonly find: RegExp;
  readonly replace: string | ((match: RegExpExecArray) => string);
  readonly name?: string;
}

function replaceEveryMatch(
  text: string,
  matches: readonly RegExpExecArray[],
  replace: string | ((match: RegExpExecArray) => string),
): string {
  let result = text;
  [...matches].reverse().forEach((match) => {
    const replacement = typeof replace === 'function' ? replace(match) : replace;
    result = `${result.slice(0, match.index)}${replacement}${result.slice(match.index + match[0].length)}`;
  });
  return result;
}

/** Replaces every plain-text match before normal insertion. */
export function textPasteRule(config: TextPasteRuleConfig): PasteRule {
  return new PasteRule(
    config.find,
    ({ text, matches }) => replaceEveryMatch(text, matches, config.replace),
    config.name,
  );
}

export interface MarkPasteRuleConfig {
  readonly find: RegExp;
  readonly mark: string;
  /** Capture group containing the content after delimiters are removed; defaults to 1 or the whole match. */
  readonly contentGroup?: number;
  readonly getAttributes?: (match: RegExpExecArray) => Attributes;
  readonly name?: string;
}

function markedLine(
  state: EditorState,
  text: string,
  expression: RegExp,
  markName: string,
  contentGroup: number,
  getAttributes?: (match: RegExpExecArray) => Attributes,
): Node[] | null {
  const markType = state.schema.marks[markName];
  if (!markType) return [];
  const nodes: Node[] = [];
  let cursor = 0;
  findMatches(expression, text).forEach((match) => {
    if (match.index > cursor) nodes.push(state.schema.text(text.slice(cursor, match.index)));
    const content = match[contentGroup] ?? match[0];
    let mark: Mark;
    try { mark = markType.create(getAttributes?.(match) ?? {}); }
    catch { return null; }
    if (content) nodes.push(state.schema.text(content, [mark]));
    cursor = match.index + match[0].length;
  });
  if (cursor < text.length) nodes.push(state.schema.text(text.slice(cursor)));
  return nodes.length ? nodes : [state.schema.text('')];
}

/** Removes delimiters and applies a schema mark to every match in every pasted line. */
export function markPasteRule(config: MarkPasteRuleConfig): PasteRule {
  return new PasteRule(config.find, ({ state, text }) => {
    if (!state.schema.marks[config.mark]) return false;
    const paragraph = state.schema.nodes.paragraph;
    if (!paragraph) return false;
    const blocks: Node[] = [];
    for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
      const inline = markedLine(state, line, config.find, config.mark, config.contentGroup ?? 1, config.getAttributes);
      if (!inline) return false;
      blocks.push(paragraph.create({}, inline));
    }
    return state.schema.topNodeType.create({}, blocks);
  }, config.name);
}

export interface WrappingPasteRuleConfig {
  readonly find: RegExp;
  readonly node: string;
  readonly getAttributes?: (matches: readonly RegExpExecArray[]) => Attributes;
  readonly name?: string;
}

/** Wraps pasted paragraphs in a compatible block node when its expression matches. */
export function wrappingPasteRule(config: WrappingPasteRuleConfig): PasteRule {
  return new PasteRule(config.find, ({ state, text, matches }) => {
    const wrapper = state.schema.nodes[config.node];
    const paragraph = state.schema.nodes.paragraph;
    if (!wrapper || !paragraph) return false;
    const paragraphs = text.replace(/\r\n?/g, '\n').split('\n').map((line) => paragraph.create({}, [state.schema.text(line)]));
    try {
      const wrapped = wrapper.create(config.getAttributes?.(matches) ?? {}, paragraphs);
      return state.schema.topNodeType.create({}, [wrapped]);
    } catch {
      return false;
    }
  }, config.name);
}
