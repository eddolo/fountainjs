// All Node imports
import { doc } from './nodes/doc';
import { paragraph } from './nodes/paragraph';
import { text } from './nodes/text';
import { heading } from './nodes/heading';
import { imageSuper } from './nodes/image-super';
import { figcaption } from './nodes/figcaption';
import { table } from './nodes/table';
import { tableRow } from './nodes/table-row';
import { tableCell } from './nodes/table-cell';
import { bulletList } from './nodes/bullet-list';
import { listItem } from './nodes/list-item';
import { codeBlock } from './nodes/code-block';

// All Mark imports
import { strong } from './marks/strong';
import { em } from './marks/em';

// All Plugin imports
import { historyPlugin } from './plugins/history';
import { markdownShortcutsPlugin } from './plugins/markdown-shortcuts';
import { SyntaxHighlightPlugin } from './plugins/syntax-highlight';
import { MCPIntegration } from './plugins/mcp-integration';

// Core imports for defining the schema
import { SchemaSpec } from '../core';

// --- Export individual items for granular use ---
export { doc } from './nodes/doc';
export { paragraph } from './nodes/paragraph';
export { text } from './nodes/text';
export { heading } from './nodes/heading';
export { imageSuper } from './nodes/image-super';
export { figcaption } from './nodes/figcaption';
export { table } from './nodes/table';
export { tableRow } from './nodes/table-row';
export { tableCell } from './nodes/table-cell';
export { bulletList } from './nodes/bullet-list';
export { listItem } from './nodes/list-item';
export { codeBlock } from './nodes/code-block';

export { strong } from './marks/strong';
export { em } from './marks/em';

export { historyPlugin, undo, redo } from './plugins/history';
export { markdownShortcutsPlugin } from './plugins/markdown-shortcuts';
export { SyntaxHighlightPlugin } from './plugins/syntax-highlight';
export { MCPIntegration, type ContentTransformRequest, type MCPTool, generateContentWithAI } from './plugins/mcp-integration';


// --- Define and Export the Core Schema Spec (ONCE) ---
export const CoreSchemaSpec: SchemaSpec = {
  nodes: {
    doc,
    paragraph,
    text,
    heading,
    image_super: imageSuper,
    figcaption,
    table,
    table_row: tableRow,
    table_cell: tableCell,
    bullet_list: bulletList,
    list_item: listItem,
    code_block: codeBlock,
  },
  marks: {
    strong,
    em,
  },
};