import {
  NodeSelection,
  Selection,
  type Editor,
  type Node,
  type NodeSpec,
  type NodeViewLike,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from '../extensions/extension';

const MAX_ANNOTATION_LENGTH = 2_000;

export interface RubyOptions {
  /** Opens the supplied annotation editor when the rendered reading is activated. Defaults to true. */
  readonly allowClickToEdit?: boolean;
  /** Replaces the default accessible annotation form without changing document commands or storage. */
  readonly renderAnnotationEditor?: RubyAnnotationEditorRenderer;
}

export interface RubyAnnotationEditorContext {
  readonly document: Document;
  readonly annotation: string;
  readonly baseText: string;
  readonly submit: (annotation: string) => boolean;
  readonly remove: () => boolean;
  readonly dismiss: () => void;
}

export type RubyAnnotationEditorRenderer = (context: RubyAnnotationEditorContext) => HTMLElement;

export interface RubyCommandOptions {
  /** Reading/pronunciation stored as portable ruby metadata. `rt` is accepted as an HTML-shaped alias. */
  readonly annotation?: string;
  readonly rt?: string;
}

export type RubyCommandInput = string | RubyCommandOptions;

export interface ActiveRuby {
  readonly path: readonly number[];
  readonly node: Node;
}

interface RubyEditorView { readonly editor: Editor }

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function normalizedAnnotation(input: RubyCommandInput): string | null {
  const value = typeof input === 'string' ? input : input.annotation ?? input.rt;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized
    && normalized.length <= MAX_ANNOTATION_LENGTH
    && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : null;
}

function rubyAncestorPath(editor: Editor, path: readonly number[]): readonly number[] | null {
  for (let length = path.length; length >= 1; length -= 1) {
    const candidate = path.slice(0, length);
    try {
      if (getNodeAtPath(editor.state.doc, candidate).type.name === 'ruby') return Object.freeze(candidate);
    } catch { return null; }
  }
  return null;
}

/** Returns the ruby node containing the complete current selection, if any. */
export function getActiveRuby(editor: Editor): ActiveRuby | null {
  const { selection } = editor.state;
  const target = selection instanceof NodeSelection
    ? (getNodeAtPath(editor.state.doc, selection.nodePath).type.name === 'ruby'
        ? Object.freeze([...selection.nodePath])
        : rubyAncestorPath(editor, selection.nodePath))
    : rubyAncestorPath(editor, selection.path);
  if (!target) return null;
  if (selection instanceof Selection) {
    const end = rubyAncestorPath(editor, selection.endPath);
    if (!end || !samePath(target, end)) return null;
  }
  try { return Object.freeze({ path: target, node: getNodeAtPath(editor.state.doc, target) }); }
  catch { return null; }
}

function createSelectedRuby(editor: Editor, annotation: string): {
  readonly parentPath: readonly number[];
  readonly parent: Node;
  readonly ruby: Node;
  readonly before: readonly Node[];
  readonly after: readonly Node[];
  readonly insertionIndex: number;
} | null {
  const { selection, schema } = editor.state;
  if (!(selection instanceof Selection) || selection.isCollapsed) return null;
  const parentPath = selection.path.slice(0, -1);
  if (!samePath(parentPath, selection.endPath.slice(0, -1))) return null;
  const startIndex = selection.path.at(-1);
  const endIndex = selection.endPath.at(-1);
  if (startIndex === undefined || endIndex === undefined || endIndex < startIndex) return null;
  let parent: Node;
  try { parent = getNodeAtPath(editor.state.doc, parentPath); }
  catch { return null; }
  const selected = parent.content.slice(startIndex, endIndex + 1);
  if (!selected.length || selected.some((node) => !node.isText)) return null;

  const base: Node[] = [];
  selected.forEach((node, index) => {
    const from = index === 0 ? selection.from : 0;
    const to = index === selected.length - 1 ? selection.to : node.text?.length ?? 0;
    const text = (node.text ?? '').slice(from, to);
    if (text) base.push(node.withText(text));
  });
  if (!base.length) return null;

  const first = selected[0] as Node;
  const last = selected.at(-1) as Node;
  const leading = (first.text ?? '').slice(0, selection.from);
  const trailing = (last.text ?? '').slice(selection.to);
  const before = [
    ...parent.content.slice(0, startIndex),
    ...(leading ? [first.withText(leading)] : []),
  ];
  const after = [
    ...(trailing ? [last.withText(trailing)] : []),
    ...parent.content.slice(endIndex + 1),
  ];
  const rubyType = schema.nodes.ruby;
  if (!rubyType) return null;
  try {
    return {
      parentPath: Object.freeze([...parentPath]),
      parent,
      ruby: rubyType.create({ rt: annotation }, base),
      before: Object.freeze(before),
      after: Object.freeze(after),
      insertionIndex: before.length,
    };
  } catch { return null; }
}

/** Wraps the selected text in one ruby annotation while retaining all base-text marks. */
export function setRuby(editor: Editor, input: RubyCommandInput): boolean {
  if (!editor.editable || getActiveRuby(editor)) return false;
  const annotation = normalizedAnnotation(input);
  if (!annotation) return false;
  const selected = createSelectedRuby(editor, annotation);
  if (!selected) return false;
  const nextParent = selected.parent.copy([...selected.before, selected.ruby, ...selected.after]);
  const first = selected.ruby.child(0);
  const lastIndex = selected.ruby.childCount - 1;
  const last = selected.ruby.child(lastIndex);
  const rubyPath = [...selected.parentPath, selected.insertionIndex];
  const transaction = editor.state.createTransaction()
    .replaceNode(selected.parentPath, [nextParent])
    .setSelection(Selection.range(
      [...rubyPath, 0],
      0,
      [...rubyPath, lastIndex],
      last.text?.length ?? 0,
    ));
  try { editor.state.schema.validate(transaction.doc); }
  catch { return false; }
  editor.dispatch(transaction);
  return first.isText;
}

/** Updates only the annotation on the active or explicitly addressed ruby node. */
export function updateRuby(editor: Editor, input: RubyCommandInput, path?: readonly number[]): boolean {
  if (!editor.editable) return false;
  const annotation = normalizedAnnotation(input);
  const targetPath = path ? Object.freeze([...path]) : getActiveRuby(editor)?.path;
  if (!annotation || !targetPath) return false;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, targetPath); }
  catch { return false; }
  if (node.type.name !== 'ruby' || node.attrs.rt === annotation) return false;
  try {
    const transaction = editor.state.createTransaction().setNodeAttrs(targetPath, { ...node.attrs, rt: annotation });
    editor.state.schema.validate(transaction.doc);
    editor.dispatch(transaction);
    return true;
  } catch { return false; }
}

/** Removes the ruby wrapper while retaining its editable base text and marks. */
export function unsetRuby(editor: Editor, path?: readonly number[]): boolean {
  if (!editor.editable) return false;
  const targetPath = path ? Object.freeze([...path]) : getActiveRuby(editor)?.path;
  if (!targetPath?.length) return false;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, targetPath); }
  catch { return false; }
  if (node.type.name !== 'ruby' || !node.childCount || node.content.some((child) => !child.isText)) return false;
  const parentPath = targetPath.slice(0, -1);
  const index = targetPath.at(-1) as number;
  const first = node.child(0);
  const lastIndex = node.childCount - 1;
  const last = node.child(lastIndex);
  const transaction = editor.state.createTransaction()
    .replaceNode(targetPath, node.content)
    .setSelection(Selection.range(
      [...parentPath, index],
      0,
      [...parentPath, index + lastIndex],
      last.text?.length ?? 0,
    ));
  try { editor.state.schema.validate(transaction.doc); }
  catch { return false; }
  editor.dispatch(transaction);
  return first.isText;
}

/** Applies ruby to a selection, or removes the ruby containing the selection. */
export function toggleRuby(editor: Editor, input: RubyCommandInput): boolean {
  return getActiveRuby(editor) ? unsetRuby(editor) : setRuby(editor, input);
}

/** HTML-shaped command aliases for hosts that prefer the `rt` terminology. */
export const setRubyText = setRuby;
export const updateRubyText = updateRuby;
export const unsetRubyText = unsetRuby;
export const toggleRubyText = toggleRuby;

function annotationButtonLabel(node: Node): string {
  return `Edit pronunciation “${String(node.attrs.rt)}” for “${node.content.map((child) => child.textContent).join('')}”`;
}

function defaultAnnotationEditor(context: RubyAnnotationEditorContext): HTMLElement {
  const form = context.document.createElement('form');
  form.className = 'fountain-ruby-editor';
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-label', 'Edit ruby annotation');

  const label = context.document.createElement('label');
  label.className = 'fountain-ruby-editor__label';
  label.textContent = `Pronunciation for “${context.baseText}”`;
  const input = context.document.createElement('input');
  input.className = 'fountain-ruby-editor__input';
  input.name = 'annotation';
  input.value = context.annotation;
  input.maxLength = MAX_ANNOTATION_LENGTH;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Ruby annotation');
  label.appendChild(input);

  const actions = context.document.createElement('div');
  actions.className = 'fountain-ruby-editor__actions';
  const save = context.document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const remove = context.document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  const cancel = context.document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  actions.append(save, remove, cancel);
  form.append(label, actions);

  let composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!composing) context.submit(input.value);
  });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      context.dismiss();
    }
  });
  remove.addEventListener('click', () => context.remove());
  cancel.addEventListener('click', context.dismiss);
  return form;
}

/** Native semantic ruby view with an optional accessible click-to-edit surface. */
export class RubyNodeView implements NodeViewLike {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly annotationDOM: HTMLElement;
  private readonly parentheses: readonly HTMLElement[];
  private current: Node;
  private editorDOM?: HTMLElement;

  constructor(
    node: Node,
    private readonly view: unknown,
    private readonly getPath: () => number[],
    private readonly options: RubyOptions = {},
  ) {
    this.current = node;
    const owner = document;
    this.dom = owner.createElement('ruby');
    this.dom.className = 'fountain-ruby';
    this.contentDOM = owner.createElement('rb');
    this.contentDOM.className = 'fountain-ruby__base';
    const open = owner.createElement('rp');
    open.textContent = '(';
    const close = owner.createElement('rp');
    close.textContent = ')';
    this.parentheses = Object.freeze([open, close]);
    this.annotationDOM = owner.createElement('rt');
    this.annotationDOM.className = 'fountain-ruby__annotation';
    this.annotationDOM.contentEditable = 'false';
    open.contentEditable = 'false';
    close.contentEditable = 'false';
    this.dom.append(this.contentDOM, open, this.annotationDOM, close);
    this.annotationDOM.addEventListener('click', this.onActivate);
    this.annotationDOM.addEventListener('keydown', this.onKeyDown);
    this.render();
  }

  update(node: Node): boolean {
    if (node.type !== this.current.type) return false;
    this.current = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target as globalThis.Node | null;
    return Boolean(target && (this.annotationDOM.contains(target) || this.editorDOM?.contains(target)));
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    const target = mutation.target;
    return this.annotationDOM.contains(target)
      || this.parentheses.some((item) => item.contains(target));
  }

  destroy(): void {
    this.dismissEditor();
    this.annotationDOM.removeEventListener('click', this.onActivate);
    this.annotationDOM.removeEventListener('keydown', this.onKeyDown);
  }

  private get editor(): Editor | null {
    return (this.view as Partial<RubyEditorView> | null)?.editor ?? null;
  }

  private get editableAnnotation(): boolean {
    return this.options.allowClickToEdit !== false && this.editor?.editable === true;
  }

  private render(): void {
    this.annotationDOM.textContent = String(this.current.attrs.rt ?? '');
    if (this.editableAnnotation) {
      this.annotationDOM.tabIndex = 0;
      this.annotationDOM.setAttribute('role', 'button');
      this.annotationDOM.setAttribute('aria-label', annotationButtonLabel(this.current));
      this.annotationDOM.title = 'Edit pronunciation';
    } else {
      this.annotationDOM.removeAttribute('tabindex');
      this.annotationDOM.removeAttribute('role');
      this.annotationDOM.removeAttribute('aria-label');
      this.annotationDOM.removeAttribute('title');
      this.dismissEditor();
    }
  }

  private openEditor(): void {
    if (!this.editableAnnotation) return;
    if (this.editorDOM) {
      this.editorDOM.querySelector<HTMLElement>('input,button,[tabindex]')?.focus({ preventScroll: true });
      return;
    }
    const owner = this.dom.ownerDocument;
    const context: RubyAnnotationEditorContext = Object.freeze({
      document: owner,
      annotation: String(this.current.attrs.rt),
      baseText: this.current.content.map((child) => child.textContent).join(''),
      submit: (annotation: string) => {
        const editor = this.editor;
        const changed = Boolean(editor && updateRuby(editor, annotation, this.getPath()));
        if (changed) this.dismissEditor();
        return changed;
      },
      remove: () => {
        const editor = this.editor;
        const changed = Boolean(editor && unsetRuby(editor, this.getPath()));
        if (changed) this.dismissEditor();
        return changed;
      },
      dismiss: () => this.dismissEditor(),
    });
    let surface: HTMLElement;
    try { surface = this.options.renderAnnotationEditor?.(context) ?? defaultAnnotationEditor(context); }
    catch { surface = defaultAnnotationEditor(context); }
    surface.dataset.fountainRubyEditor = '';
    surface.style.position = 'fixed';
    const rect = this.annotationDOM.getBoundingClientRect();
    surface.style.visibility = 'hidden';
    owner.body.appendChild(surface);
    const surfaceRect = surface.getBoundingClientRect();
    const viewportWidth = owner.defaultView?.innerWidth ?? surfaceRect.width + 16;
    surface.style.left = `${Math.max(8, Math.min(rect.left, viewportWidth - surfaceRect.width - 8))}px`;
    surface.style.bottom = '8px';
    surface.style.top = 'auto';
    surface.style.visibility = '';
    this.editorDOM = surface;
    owner.addEventListener('pointerdown', this.onOutsidePointerDown, true);
    surface.querySelector<HTMLElement>('input,button,[tabindex]')?.focus({ preventScroll: true });
  }

  private dismissEditor(): void {
    const owner = this.dom.ownerDocument;
    owner.removeEventListener('pointerdown', this.onOutsidePointerDown, true);
    this.editorDOM?.remove();
    this.editorDOM = undefined;
  }

  private onActivate = (event: Event): void => {
    if (!this.editableAnnotation) return;
    event.preventDefault();
    event.stopPropagation();
    this.openEditor();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    this.onActivate(event);
  };

  private onOutsidePointerDown = (event: Event): void => {
    const target = event.target as globalThis.Node | null;
    if (!target || this.editorDOM?.contains(target) || this.annotationDOM.contains(target)) return;
    this.dismissEditor();
  };
}

function createRubyNode(options: RubyOptions): NodeSpec {
  const ConfiguredRubyNodeView = class extends RubyNodeView {
    constructor(node: Node, view: unknown, getPath: () => number[]) { super(node, view, getPath, options); }
  };
  return {
    group: 'inline',
    inline: true,
    content: 'text+',
    attrs: {
      rt: {
        validate: (value) => typeof value === 'string'
          && value.length > 0
          && value.length <= MAX_ANNOTATION_LENGTH
          && value === value.trim()
          && !/[\u0000-\u001f\u007f]/u.test(value),
      },
    },
    parseDOM: [{ tag: 'ruby' }],
    toDOM: (node) => [
      'ruby',
      { className: 'fountain-ruby', 'data-fountain-ruby': 'true' },
      ['rb', { className: 'fountain-ruby__base' }, 0],
      ['rp', {}, '('],
      ['rt', { className: 'fountain-ruby__annotation' }, String(node.attrs.rt)],
      ['rp', {}, ')'],
    ],
    toText: (node) => `${node.content.map((child) => child.textContent).join('')} (${String(node.attrs.rt)})`,
    nodeView: ConfiguredRubyNodeView,
  };
}

/** Creates the optional framework-neutral ruby/furigana module. */
export function createRubyExtension(options: RubyOptions = {}): FountainExtension {
  return defineExtension({
    name: 'ruby',
    nodes: { ruby: createRubyNode(options) },
    commands: {
      setRuby,
      updateRuby,
      unsetRuby,
      toggleRuby,
      setRubyText,
      updateRubyText,
      unsetRubyText,
      toggleRubyText,
    },
  });
}

export const rubyNode: NodeSpec = createRubyNode({});
export const RubyExtension = createRubyExtension();
