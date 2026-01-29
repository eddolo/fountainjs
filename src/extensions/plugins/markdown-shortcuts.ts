import { Plugin, Node, EditorState, Transaction } from '../../core';

export interface InputRule {
  pattern: RegExp;
  handler: (props: { state: EditorState; match: RegExpMatchArray; from: number; to: number }) => Transaction | null;
}

export const markdownShortcutsPlugin = new Plugin({});

// --- Define our rules with more robust handlers ---

export const headingRule: InputRule = {
  // Matches '## ' at the start of a string.
  pattern: /^(##\s)$/,
  handler: ({ state, from, to }) => {
    // Find the path to the start of the current text block
    const selectionPath = state.selection.path;
    if (selectionPath.length < 2) return null; // Must be inside a paragraph
    const blockPath = selectionPath.slice(0, -1);
    
    // Create a new heading node
    const { heading } = state.schema.nodes;
    if (!heading) return null;
    const newHeading = new Node(heading, { level: 2 });
    
    // This is a simplified transaction that replaces the entire parent paragraph
    const tr = state.createTransaction().replace(blockPath[0], blockPath[0] + 1, [newHeading]);
    return tr;
  },
};

export const bulletListRule: InputRule = {
  // Matches '* ' at the start of a string.
  pattern: /^(\*\s)$/,
  handler: ({ state, from, to }) => {
    const selectionPath = state.selection.path;
    if (selectionPath.length < 2) return null; // Must be inside a paragraph
    const blockPath = selectionPath.slice(0, -1);

    const { list_item, bullet_list, paragraph } = state.schema.nodes;
    if (!list_item || !bullet_list || !paragraph) return null;

    // Create a new bullet list with one item containing an empty paragraph
    const newListItem = new Node(list_item, {}, [new Node(paragraph, {})]);
    const newList = new Node(bullet_list, {}, [newListItem]);

    const tr = state.createTransaction().replace(blockPath[0], blockPath[0] + 1, [newList]);
    return tr;
  },
};

export const markdownRules = [headingRule, bulletListRule];