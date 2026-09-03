import { Node, Selection, type Schema } from '../../core';
import { InputRule, inputRulesPlugin } from './input-rules';

function paragraph(schema: Schema, text = ''): Node {
  return schema.node('paragraph', {}, [schema.text(text)]);
}

function replaceTopLevelBlock(
  pattern: RegExp,
  name: string,
  create: (schema: Schema, match: RegExpExecArray) => { node: Node; selectionPath: readonly number[] },
): InputRule {
  return new InputRule(pattern, ({ state, range, match }) => {
    if (range.path.length !== 2 || range.from !== 0) return null;
    const blockIndex = range.path[0] as number;
    const { node, selectionPath } = create(state.schema, match);
    return state.createTransaction()
      .replace(blockIndex, blockIndex + 1, [node])
      .setSelection(Selection.cursor([blockIndex, ...selectionPath], 0));
  }, name);
}

export const markdownInputRules = Object.freeze([
  replaceTopLevelBlock(/^(#{1,6}) $/, 'heading', (schema, match) => ({
    node: schema.node('heading', { level: match[1]?.length ?? 1 }, [schema.text('')]),
    selectionPath: [0],
  })),
  replaceTopLevelBlock(/^[-*] $/, 'bullet-list', (schema) => ({
    node: schema.node('bullet_list', {}, [schema.node('list_item', {}, [paragraph(schema)])]),
    selectionPath: [0, 0, 0],
  })),
  replaceTopLevelBlock(/^1\. $/, 'ordered-list', (schema) => ({
    node: schema.node('ordered_list', { start: 1 }, [schema.node('list_item', {}, [paragraph(schema)])]),
    selectionPath: [0, 0, 0],
  })),
  replaceTopLevelBlock(/^\[([ xX])\] $/, 'task-list', (schema, match) => ({
    node: schema.node('task_list', {}, [
      schema.node('task_item', { checked: /[xX]/.test(match[1] ?? '') }, [paragraph(schema)]),
    ]),
    selectionPath: [0, 0, 0],
  })),
  replaceTopLevelBlock(/^> $/, 'blockquote', (schema) => ({
    node: schema.node('blockquote', {}, [paragraph(schema)]),
    selectionPath: [0, 0],
  })),
  replaceTopLevelBlock(/^```([a-z0-9_+-]*) $/i, 'code-block', (schema, match) => ({
    node: schema.node('code_block', { language: match[1] || 'text', lineNumbers: true }, [schema.text('')]),
    selectionPath: [0],
  })),
]);

export const markdownShortcutsPlugin = inputRulesPlugin({ rules: markdownInputRules });
