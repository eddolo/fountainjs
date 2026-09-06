import {
  AllSelection,
  GapSelection,
  Node,
  NodeSelection,
  PluginKey,
  Selection,
  type Editor,
  type NodeSpec,
  type NodeViewConstructor,
  type NodeViewLike,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import { MarkdownImporter } from '../core/importers/markdown-importer';
import { defineExtension, type FountainExtension } from './extension';
import {
  InputRule,
  inputRulesPlugin,
  type InputRulesState,
} from './plugins/input-rules';
import { setHistoryGroup } from './plugins/history';
import { PasteRule, pasteRulesPlugin } from './plugins/paste-rules';

export const MAX_MATH_SOURCE_LENGTH = 20_000;

function validMathSource(value: unknown): boolean {
  return typeof value === 'string'
    && value.length <= MAX_MATH_SOURCE_LENGTH
    && !value.includes('\0');
}

const mathAttributes = {
  latex: { default: '', validate: validMathSource },
  ariaLabel: { default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= 1_000 },
} as const;

export interface MathRenderContext {
  readonly displayMode: boolean;
  readonly document: Document;
}

/**
 * A renderer returns DOM, never an HTML string. This keeps the extension
 * framework-neutral and makes the trust boundary explicit.
 */
export type MathRenderer = (latex: string, context: MathRenderContext) => globalThis.Node;

export interface KaTeXCompatible {
  render(latex: string, element: HTMLElement, options?: Readonly<Record<string, unknown>>): void;
}

/** Adapts a caller-owned KaTeX installation without making it a core dependency. */
export function createKaTeXRenderer(
  katex: KaTeXCompatible,
  options: Readonly<Record<string, unknown>> = {},
): MathRenderer {
  if (!katex || typeof katex.render !== 'function') throw new TypeError('A KaTeX-compatible render function is required.');
  return (latex, context) => {
    const mount = context.document.createElement(context.displayMode ? 'div' : 'span');
    katex.render(latex, mount, {
      output: 'htmlAndMathml',
      throwOnError: false,
      strict: 'warn',
      ...options,
      displayMode: context.displayMode,
      trust: false,
    });
    return mount;
  };
}

export interface MathExtensionOptions {
  /** Optional visual renderer such as `createKaTeXRenderer(katex)`. */
  readonly renderer?: MathRenderer;
  /** Enables `$...$` and `$$...$$` typing rules. Defaults to true. */
  readonly inputRules?: boolean;
  /** Parses pasted `$...$` and `$$...$$` Markdown as math nodes. Defaults to true. */
  readonly pasteRules?: boolean;
  /** Visual container treatment. Defaults to the neutral `plain` appearance. */
  readonly appearance?: 'plain' | 'tinted' | 'outlined';
  readonly onRenderError?: (error: unknown, latex: string) => void;
}

function createMathNodeView(
  displayMode: boolean,
  renderer?: MathRenderer,
  onRenderError?: MathExtensionOptions['onRenderError'],
  appearance: NonNullable<MathExtensionOptions['appearance']> = 'plain',
): NodeViewConstructor {
  return class MathNodeView implements NodeViewLike {
    readonly dom = document.createElement(displayMode ? 'div' : 'span');
    private readonly output = document.createElement(displayMode ? 'div' : 'span');
    private readonly sourceEditor = document.createElement(displayMode ? 'div' : 'span');
    private readonly sourceInput = document.createElement('input');
    private current: Node;

    constructor(node: Node, private readonly view: unknown, private readonly getPath: () => number[]) {
      this.current = node;
      this.dom.className = `fountain-math fountain-math--${displayMode ? 'display' : 'inline'}`;
      this.dom.dataset.fountainMath = displayMode ? 'block' : 'inline';
      this.dom.dataset.fountainMathAppearance = appearance;
      this.dom.setAttribute('role', 'math');
      this.output.className = 'fountain-math__output';
      this.sourceEditor.className = 'fountain-math__source-editor';
      this.sourceEditor.contentEditable = 'false';
      this.sourceEditor.hidden = true;
      this.sourceInput.className = 'fountain-math__source-input';
      this.sourceInput.type = 'text';
      this.sourceInput.maxLength = MAX_MATH_SOURCE_LENGTH;
      this.sourceInput.autocomplete = 'off';
      this.sourceInput.spellcheck = false;
      this.sourceInput.placeholder = 'Enter LaTeX';
      this.sourceInput.setAttribute('aria-label', 'Edit math source');
      this.sourceInput.addEventListener('input', this.onSourceInput);
      this.sourceInput.addEventListener('keydown', this.onSourceKeyDown);
      this.sourceInput.addEventListener('blur', this.commitSource);
      this.sourceEditor.append(this.sourceInput);
      this.dom.append(this.output, this.sourceEditor);
      this.render();
    }

    update(node: Node): boolean {
      if (node.type !== this.current.type) return false;
      this.current = node;
      this.render();
      return true;
    }

    selectNode(): void {
      this.dom.dataset.fountainMathSelected = 'true';
      if (this.editor?.editable) {
        this.sourceInput.value = String(this.current.attrs.latex ?? '');
        this.sourceEditor.hidden = false;
      }
    }

    deselectNode(): void {
      this.commitSource();
      delete this.dom.dataset.fountainMathSelected;
      this.sourceEditor.hidden = true;
    }

    stopEvent(event: Event): boolean {
      return this.sourceEditor.contains(event.target as globalThis.Node);
    }

    ignoreMutation(mutation: MutationRecord): boolean {
      if (this.sourceEditor.contains(mutation.target)) return true;
      return mutation.target === this.dom
        && ['data-fountain-math-selected', 'data-latex', 'title', 'aria-label'].includes(mutation.attributeName ?? '');
    }

    destroy(): void {
      this.sourceInput.removeEventListener('input', this.onSourceInput);
      this.sourceInput.removeEventListener('keydown', this.onSourceKeyDown);
      this.sourceInput.removeEventListener('blur', this.commitSource);
    }

    private get editor(): Editor | null {
      return (this.view as { readonly editor?: Editor } | null)?.editor ?? null;
    }

    private onSourceInput = (): void => {
      const editor = this.editor;
      const latex = this.sourceInput.value;
      if (!editor || !validInsertionSource(latex)) return;
      replaceMathSource(editor, latex, undefined, this.getPath(), `math-source:${this.getPath().join('.')}`);
    };

    private commitSource = (): void => {
      const editor = this.editor;
      const latex = this.sourceInput.value;
      if (!editor || !validInsertionSource(latex)) {
        this.sourceInput.value = String(this.current.attrs.latex ?? '');
        return;
      }
      replaceMathSource(editor, latex, undefined, this.getPath());
    };

    private onSourceKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.sourceInput.value = String(this.current.attrs.latex ?? '');
        this.sourceInput.blur();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.sourceInput.blur();
      }
    };

    private render(): void {
      const latex = String(this.current.attrs.latex ?? '');
      this.dom.dataset.latex = latex;
      this.dom.title = latex;
      this.dom.setAttribute('aria-label', String(this.current.attrs.ariaLabel || `Math expression: ${latex}`));
      delete this.dom.dataset.fountainMathError;
      try {
        if (!renderer) throw new Error('No math renderer configured.');
        const rendered = renderer(latex, { displayMode, document: this.dom.ownerDocument });
        const NodeConstructor = this.dom.ownerDocument.defaultView?.Node;
        if (!NodeConstructor || !(rendered instanceof NodeConstructor)) {
          throw new TypeError('Math renderers must return a DOM Node.');
        }
        this.output.replaceChildren(rendered);
      } catch (error) {
        if (renderer) onRenderError?.(error, latex);
        const source = this.dom.ownerDocument.createElement('code');
        source.dataset.fountainMathSource = 'true';
        source.textContent = latex;
        this.output.replaceChildren(source);
        if (renderer) this.dom.dataset.fountainMathError = 'true';
      }
      if (this.sourceInput !== this.dom.ownerDocument.activeElement) this.sourceInput.value = latex;
    }
  };
}

function mathNodeSpecs(options: MathExtensionOptions): { inline_math: NodeSpec; math_block: NodeSpec } {
  const appearance = options.appearance ?? 'plain';
  if (!['plain', 'tinted', 'outlined'].includes(appearance)) {
    throw new TypeError(`Unknown math appearance: ${appearance}.`);
  }
  const InlineMathView = createMathNodeView(false, options.renderer, options.onRenderError, appearance);
  const MathBlockView = createMathNodeView(true, options.renderer, options.onRenderError, appearance);
  return {
    inline_math: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: mathAttributes,
      toText: (node) => String(node.attrs.latex ?? ''),
      nodeView: InlineMathView,
      toDOM: (node) => ['span', {
        class: 'fountain-math fountain-math--inline',
        'data-fountain-math': 'inline',
        'data-fountain-math-appearance': appearance,
        'data-latex': node.attrs.latex,
        'data-math-aria-label': node.attrs.ariaLabel,
        role: 'math',
        'aria-label': node.attrs.ariaLabel || `Math expression: ${String(node.attrs.latex)}`,
      }, ['code', String(node.attrs.latex)]],
    },
    math_block: {
      group: 'block',
      atom: true,
      attrs: mathAttributes,
      toText: (node) => String(node.attrs.latex ?? ''),
      nodeView: MathBlockView,
      toDOM: (node) => ['div', {
        class: 'fountain-math fountain-math--display',
        'data-fountain-math': 'block',
        'data-fountain-math-appearance': appearance,
        'data-latex': node.attrs.latex,
        'data-math-aria-label': node.attrs.ariaLabel,
        role: 'math',
        'aria-label': node.attrs.ariaLabel || `Math expression: ${String(node.attrs.latex)}`,
      }, ['code', String(node.attrs.latex)]],
    },
  };
}

function selectedSource(editor: Editor, supplied?: string): string | null {
  if (supplied !== undefined) return supplied;
  const selection = editor.state.selection;
  if (selection.kind !== 'text' || !selection.isSingleText || selection.isCollapsed) return null;
  const target = getNodeAtPath(editor.state.doc, selection.path);
  return (target.text ?? '').slice(selection.from, selection.to);
}

function validInsertionSource(value: string | null): value is string {
  return value !== null && value.trim().length > 0 && validMathSource(value);
}

/** Replaces the current single-text selection, or inserts at the cursor, with inline TeX. */
export function insertInlineMath(editor: Editor, latex?: string, ariaLabel = ''): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const source = selectedSource(editor, latex);
  if (!validInsertionSource(source)) return false;
  const type = state.schema.nodes.inline_math;
  const selection = state.selection;
  if (!type || selection.kind !== 'text' || !selection.isSingleText) return false;
  const target = getNodeAtPath(state.doc, selection.path);
  if (!target.isText) return false;
  let math: Node;
  try { math = type.create({ latex: source, ariaLabel }); }
  catch { return false; }
  const index = selection.path.at(-1) as number;
  const before = (target.text ?? '').slice(0, selection.from);
  const after = (target.text ?? '').slice(selection.to);
  const replacement = [
    ...(before ? [target.withText(before)] : []),
    math,
    target.withText(after),
  ];
  const mathPath = [...selection.path.slice(0, -1), index + (before ? 1 : 0)];
  const transaction = state.createTransaction().replaceNode(selection.path, replacement);
  transaction.setSelection(new NodeSelection(transaction.doc, mathPath));
  editor.dispatch(transaction);
  return true;
}

/**
 * Inserts display math at a structural gap, after the current top-level block,
 * or in place of an all-document selection.
 */
export function insertMathBlock(editor: Editor, latex: string, ariaLabel = ''): boolean {
  if (!editor.editable || !validInsertionSource(latex)) return false;
  const type = editor.state.schema.nodes.math_block;
  if (!type) return false;
  let math: Node;
  try { math = type.create({ latex, ariaLabel }); }
  catch { return false; }
  const { selection, schema } = editor.state;
  const allSelected = selection instanceof AllSelection;
  const index = allSelected
    ? 0
    : selection instanceof GapSelection && selection.parentPath.length === 0
      ? selection.index
      : Math.min(
        editor.state.doc.childCount,
        (selection.endPath[0] ?? editor.state.doc.childCount - 1) + 1,
      );
  const paragraph = schema.nodes.paragraph?.create({}, [schema.text('')]);
  const transaction = editor.state.createTransaction().replace(
    index,
    allSelected ? editor.state.doc.childCount : index,
    paragraph ? [math, paragraph] : [math],
  );
  transaction.setSelection(new NodeSelection(transaction.doc, [index]));
  editor.dispatch(transaction);
  return true;
}

export interface ActiveMath {
  readonly path: readonly number[];
  readonly node: Node;
  readonly displayMode: boolean;
}

/** Returns the selected inline or display math node, or the requested math path. */
export function getActiveMath(editor: Editor, requestedPath?: readonly number[]): ActiveMath | null {
  const path = requestedPath
    ?? (editor.state.selection instanceof NodeSelection ? editor.state.selection.nodePath : null);
  if (!path) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, path);
    if (node.type.name !== 'inline_math' && node.type.name !== 'math_block') return null;
    return { path: Object.freeze([...path]), node, displayMode: node.type.name === 'math_block' };
  } catch { return null; }
}

function replaceMathSource(
  editor: Editor,
  latex: string,
  ariaLabel?: string,
  requestedPath?: readonly number[],
  historyGroup?: string,
): boolean {
  if (!editor.editable || !validInsertionSource(latex)) return false;
  const active = getActiveMath(editor, requestedPath);
  if (!active) return false;
  const { node, path } = active;
  const attrs = { ...node.attrs, latex, ...(ariaLabel === undefined ? {} : { ariaLabel }) };
  if (String(node.attrs.latex) === latex
    && (ariaLabel === undefined || node.attrs.ariaLabel === ariaLabel)) return false;
  let replacement: Node;
  try { replacement = node.type.create(attrs); }
  catch { return false; }
  const transaction = editor.state.createTransaction().replaceNode(path, [replacement]);
  if (historyGroup) setHistoryGroup(transaction, historyGroup);
  if (editor.state.selection instanceof NodeSelection
    && editor.state.selection.nodePath.join('.') === path.join('.')) {
    transaction.setSelection(new NodeSelection(transaction.doc, path));
  }
  editor.dispatch(transaction);
  return true;
}

/** Updates the selected inline or display math node, or an explicit math path. */
export function setMathSource(editor: Editor, latex: string, ariaLabel?: string, path?: readonly number[]): boolean {
  return replaceMathSource(editor, latex, ariaLabel, path);
}

function inlineMathRule(): InputRule {
  return new InputRule(/(?<![\\$])\$(?!\$)(?!\s)([^$\n]*\S)(?<!\\)\$$/, ({ state, range, match }) => {
    const type = state.schema.nodes.inline_math;
    const source = match[1] ?? '';
    if (!type || !validInsertionSource(source)) return null;
    const target = getNodeAtPath(state.doc, range.path);
    const before = (target.text ?? '').slice(0, range.from);
    const after = (target.text ?? '').slice(range.to);
    const index = range.path.at(-1) as number;
    const mathIndex = index + (before ? 1 : 0);
    const transaction = state.createTransaction().replaceNode(range.path, [
      ...(before ? [target.withText(before)] : []),
      type.create({ latex: source }),
      target.withText(after),
    ]);
    return transaction.setSelection(new NodeSelection(transaction.doc, [
      ...range.path.slice(0, -1),
      mathIndex,
    ]));
  }, 'inline-math');
}

function blockMathRule(): InputRule {
  return new InputRule(/^\$\$([^$\n]+)\$\$$/, ({ state, range, match }) => {
    const type = state.schema.nodes.math_block;
    const source = match[1] ?? '';
    if (!type || !validInsertionSource(source) || range.path.length !== 2 || range.from !== 0) return null;
    const blockIndex = range.path[0] as number;
    const paragraph = state.schema.nodes.paragraph?.create({}, [state.schema.text('')]);
    const replacement = paragraph ? [type.create({ latex: source }), paragraph] : [type.create({ latex: source })];
    const transaction = state.createTransaction().replace(blockIndex, blockIndex + 1, replacement);
    return transaction.setSelection(new NodeSelection(transaction.doc, [blockIndex]));
  }, 'display-math');
}

export const mathPasteRule = new PasteRule(
  /\$\$[\s\S]+?\$\$|\$(?!\$)(?!\s)(?:\\.|[^$\\\n])*(?<!\s)\$/g,
  ({ state, text }) => MarkdownImporter.parse(text, state.schema),
  'math-markdown',
);

export const mathInputRulesKey = new PluginKey<InputRulesState>('math-input-rules');

/** Creates an independently composable first-party mathematics extension. */
export function createMathExtension(options: MathExtensionOptions = {}): FountainExtension {
  const plugins = [];
  if (options.inputRules !== false) plugins.push(inputRulesPlugin({
    key: mathInputRulesKey,
    rules: [blockMathRule(), inlineMathRule()],
  }));
  if (options.pasteRules !== false) plugins.push(pasteRulesPlugin({ rules: [mathPasteRule] }));
  return defineExtension({
    name: 'math',
    nodes: mathNodeSpecs(options),
    plugins,
    commands: { insertInlineMath, insertMathBlock, setMathSource },
    services: options.renderer ? { mathRenderer: options.renderer } : {},
  });
}

export const MathExtension = createMathExtension();
