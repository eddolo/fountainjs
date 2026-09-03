import type { SchemaSpec } from '../core';
import * as coreCommands from '../core/commands';
import * as structureCommands from '../core/structure-commands';
import { HTMLExporter } from '../core/exporters/html-exporter';
import { JSONExporter } from '../core/exporters/json-exporter';
import { MarkdownExporter } from '../core/exporters/markdown-exporter';
import { TextExporter } from '../core/exporters/text-exporter';
import { HTMLImporter } from '../core/importers/html-importer';
import { MarkdownImporter } from '../core/importers/markdown-importer';
import { blockquote } from './nodes/blockquote';
import { bulletList } from './nodes/bullet-list';
import { codeBlock } from './nodes/code-block';
import { doc } from './nodes/doc';
import { figcaption } from './nodes/figcaption';
import { hardBreak } from './nodes/hard-break';
import { heading } from './nodes/heading';
import { horizontalRule } from './nodes/horizontal-rule';
import { imageSuper } from './nodes/image-super';
import { listItem } from './nodes/list-item';
import { orderedList } from './nodes/ordered-list';
import { paragraph } from './nodes/paragraph';
import { table } from './nodes/table';
import { tableCell } from './nodes/table-cell';
import { tableHeader } from './nodes/table-header';
import { tableRow } from './nodes/table-row';
import { taskItem } from './nodes/task-item';
import { taskList } from './nodes/task-list';
import { text } from './nodes/text';
import { code } from './marks/code';
import { em } from './marks/em';
import { highlight } from './marks/highlight';
import { link } from './marks/link';
import { strike } from './marks/strike';
import { strong } from './marks/strong';
import { subscript } from './marks/subscript';
import { superscript } from './marks/superscript';
import { textColor } from './marks/text-color';
import { underline } from './marks/underline';
import { canRedo, canUndo, historyPlugin, redo, undo } from './plugins/history';
import { markdownShortcutsPlugin } from './plugins/markdown-shortcuts';
import { composeExtensions, defineExtension } from './extension';

export * from './extension';

export * from './nodes/blockquote';
export * from './nodes/bullet-list';
export * from './nodes/code-block';
export * from './nodes/doc';
export * from './nodes/figcaption';
export * from './nodes/hard-break';
export * from './nodes/heading';
export * from './nodes/horizontal-rule';
export * from './nodes/image-super';
export * from './nodes/list-item';
export * from './nodes/ordered-list';
export * from './nodes/paragraph';
export * from './nodes/table';
export * from './nodes/table-cell';
export * from './nodes/table-header';
export * from './nodes/table-row';
export * from './nodes/task-item';
export * from './nodes/task-list';
export * from './nodes/text';
export * from './marks/code';
export * from './marks/em';
export * from './marks/highlight';
export * from './marks/link';
export * from './marks/strike';
export * from './marks/strong';
export * from './marks/subscript';
export * from './marks/superscript';
export * from './marks/text-color';
export * from './marks/underline';
export * from './plugins/history';
export * from './plugins/markdown-shortcuts';
export * from './plugins/syntax-highlight';
export * from './plugins/mcp-integration';

export const CoreExtension = defineExtension({
  name: 'fountain-core',
  nodes: {
    doc, paragraph, text, heading, blockquote,
    bullet_list: bulletList, ordered_list: orderedList, list_item: listItem,
    task_list: taskList, task_item: taskItem,
    code_block: codeBlock, horizontal_rule: horizontalRule, hard_break: hardBreak,
    image_super: imageSuper, figcaption,
    table, table_row: tableRow, table_header: tableHeader, table_cell: tableCell,
  },
  marks: { strong, em, underline, strike, code, highlight, link, text_color: textColor, subscript, superscript },
  commands: { ...coreCommands, ...structureCommands },
});

export const CoreSchemaSpec: SchemaSpec = composeExtensions([CoreExtension]).schema;

export const HistoryExtension = defineExtension({ name: 'history', plugins: [historyPlugin], commands: { undo, redo, canUndo, canRedo } });
export const MarkdownShortcutsExtension = defineExtension({ name: 'markdown-shortcuts', plugins: [markdownShortcutsPlugin] });
export const MarkdownFormatExtension = defineExtension({
  name: 'markdown-format',
  formats: { markdown: { parse: MarkdownImporter.parse, serialize: MarkdownExporter.export } },
});
export const HTMLFormatExtension = defineExtension({
  name: 'html-format',
  formats: { html: { parse: HTMLImporter.parse, serialize: (document) => HTMLExporter.export(document, { document: false }) } },
});
export const JSONFormatExtension = defineExtension({
  name: 'json-format',
  formats: { json: { parse: JSONExporter.import, serialize: JSONExporter.export } },
});
export const TextFormatExtension = defineExtension({
  name: 'text-format',
  formats: { text: { serialize: TextExporter.export } },
});

export const StarterKit = composeExtensions([
  CoreExtension,
  HistoryExtension,
  MarkdownShortcutsExtension,
  MarkdownFormatExtension,
  HTMLFormatExtension,
  JSONFormatExtension,
  TextFormatExtension,
]);
