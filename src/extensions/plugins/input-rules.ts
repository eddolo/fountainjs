import {
  Node,
  Plugin,
  PluginKey,
  Selection,
  type Editor,
  type EditorState,
  type Mark,
  type AnySelection,
  type Transaction,
} from '../../core';
import { getNodeAtPath } from '../../core/transaction/path';

const INPUT_RULE_META = 'fountain$inputRule';
const INPUT_RULE_UNDO_META = 'fountain$inputRuleUndo';

export interface InputRuleRange {
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
}

export interface InputRuleContext {
  readonly editor: Editor;
  readonly state: EditorState;
  readonly range: InputRuleRange;
  readonly match: RegExpExecArray;
  readonly input: string;
}

export type InputRuleHandler = (context: InputRuleContext) => Transaction | null | false;

/** A typing rule whose expression is matched against text through the new input. */
export class InputRule {
  constructor(
    public readonly find: RegExp,
    public readonly handler: InputRuleHandler,
    public readonly name = find.source,
  ) {
    if (!(find instanceof RegExp)) throw new TypeError('Input rules require a regular expression.');
    if (typeof handler !== 'function') throw new TypeError('Input rules require a handler.');
  }
}

interface InputRuleSnapshot {
  readonly doc: Node;
  readonly selection: AnySelection;
  readonly storedMarks: readonly Mark[];
}

export interface InputRulesState {
  readonly rule?: string;
  readonly before?: InputRuleSnapshot;
  readonly after?: InputRuleSnapshot;
}

export interface InputRulesConfig {
  readonly rules: readonly InputRule[];
  readonly undoOnBackspace?: boolean;
  /** Use a separate key when several independently packaged rule sets coexist. */
  readonly key?: PluginKey<InputRulesState>;
}

export const inputRulesKey = new PluginKey<InputRulesState>('input-rules');

function snapshot(state: EditorState): InputRuleSnapshot {
  return { doc: state.doc, selection: state.selection, storedMarks: state.storedMarks };
}

function expressionFor(rule: InputRule): RegExp {
  return new RegExp(rule.find.source, rule.find.flags.replace(/g/g, ''));
}

function naturalInputSnapshot(state: EditorState, path: readonly number[], from: number, to: number, input: string): InputRuleSnapshot {
  const transaction = state.createTransaction()
    .replaceText(path, from, to, input)
    .setStoredMarks(state.storedMarks)
    .setSelection(Selection.cursor(path, from + input.length));
  return { doc: transaction.doc, selection: transaction.selection, storedMarks: transaction.storedMarks };
}

/** Restores the literal text that triggered the most recent input rule. */
export function undoInputRule(editor: Editor, key: PluginKey<InputRulesState> = inputRulesKey): boolean {
  const value = key.get(editor.state);
  const before = value?.before;
  const after = value?.after;
  if (!before || !after || !editor.state.doc.eq(after.doc) || !editor.state.selection.eq(after.selection)) return false;
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, before.doc.content)
    .setSelection(before.selection)
    .setStoredMarks(before.storedMarks)
    .setMeta(INPUT_RULE_UNDO_META, true)
    .setMeta('addToHistory', false);
  editor.dispatch(transaction);
  return true;
}

/** Creates a plugin that applies the first matching rule after typed input. */
export function inputRulesPlugin(config: InputRulesConfig): Plugin<InputRulesState> {
  const rules = Object.freeze([...config.rules]);
  const key = config.key ?? inputRulesKey;
  return new Plugin<InputRulesState>({
    key,
    state: {
      init: () => ({}),
      apply: (transaction, value, _oldState, newState) => {
        if (transaction.getMeta(INPUT_RULE_UNDO_META)) return {};
        const applied = transaction.getMeta<{ rule: string; before: InputRuleSnapshot }>(INPUT_RULE_META);
        if (applied) return { rule: applied.rule, before: applied.before, after: snapshot(newState) };
        if (transaction.docChanged || transaction.selectionSet) return {};
        return value;
      },
    },
    props: {
      handleTextInput: (editor, from, to, input) => {
        const { state } = editor;
        const { selection } = state;
        if (!selection.isSingleText || selection.from !== from || selection.to !== to) return false;
        const target = getNodeAtPath(state.doc, selection.path);
        if (!target.isText) return false;
        const throughInput = `${(target.text ?? '').slice(0, from)}${input}`;

        for (const rule of rules) {
          const match = expressionFor(rule).exec(throughInput);
          if (!match || match.index + match[0].length !== throughInput.length) continue;
          const range = { path: selection.path, from: throughInput.length - match[0].length, to: from };
          const transaction = rule.handler({ editor, state, range, match, input });
          if (!transaction) continue;
          transaction.setMeta(INPUT_RULE_META, {
            rule: rule.name,
            before: naturalInputSnapshot(state, selection.path, from, to, input),
          });
          editor.dispatch(transaction);
          return true;
        }
        return false;
      },
      handleKeyDown: (editor, event) => {
        if (config.undoOnBackspace === false || event.key !== 'Backspace' || event.ctrlKey || event.metaKey || event.altKey) return false;
        return undoInputRule(editor, key);
      },
    },
  });
}

export interface TextInputRuleConfig {
  readonly find: RegExp;
  readonly replace: string | ((match: RegExpExecArray) => string);
  readonly name?: string;
}

/** Creates a rule that replaces its matched text with a string. */
export function textInputRule(config: TextInputRuleConfig): InputRule {
  return new InputRule(config.find, ({ state, range, match }) => {
    const replacement = typeof config.replace === 'function' ? config.replace(match) : config.replace;
    return state.createTransaction()
      .replaceText(range.path, range.from, range.to, replacement)
      .setSelection(Selection.cursor(range.path, range.from + replacement.length));
  }, config.name);
}
