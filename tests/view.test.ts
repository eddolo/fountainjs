// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  CoreSchemaSpec,
  COLLABORATION_REMOTE_META,
  StarterKit,
  EditorView,
  HTMLExporter,
  Selection as EditorSelection,
  Plugin,
  PluginKey,
  Decoration,
  DecorationSet,
  closeHistory,
  composeExtensions,
  createHistoryPlugin,
  createEditor,
  defineExtension,
  insertImageFile,
  insertText,
  registerFountainElement,
  redo,
  selectNode,
  selectText,
  setNodeAttributes,
  undo,
} from '../src';

describe('EditorView', () => {
  it('renders an accessible editor and handles beforeinput', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, { ariaLabel: 'Story editor', placeholder: 'Begin…' });
    expect(view.dom.getAttribute('role')).toBe('textbox');
    expect(view.dom.getAttribute('aria-label')).toBe('Story editor');
    expect(view.dom.dataset.placeholder).toBe('Begin…');

    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'Hello' }));
    expect(editor.getText()).toBe('Hello');
    expect(view.dom.textContent).toBe('Hello');
    view.destroy();
    expect(mount.childElementCount).toBe(0);
  });

  it('adds focus to atomic chains while keeping capability checks side-effect free', () => {
    const updates: string[] = [];
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
        ],
      },
      onUpdate: (state) => updates.push(state.doc.textContent),
    });
    const initialSelection = editor.state.selection;
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const commands = view.commandManager(StarterKit.commands);

    expect(commands.can().focus('end')).toBe(true);
    expect(editor.state.selection.eq(initialSelection)).toBe(true);
    expect(document.activeElement).not.toBe(view.dom);

    expect(commands.chain().focus('end').insertText('!').run()).toBe(true);
    expect(editor.getText()).toBe('First\nSecond!');
    expect(document.activeElement).toBe(view.dom);
    expect(updates).toEqual(['FirstSecond!']);
    view.destroy();
  });

  it('does not let an unfocused editor update steal another editor DOM selection', async () => {
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared' }] }],
    } as const;
    const first = createEditor({ schema: CoreSchemaSpec, content });
    const second = createEditor({ schema: CoreSchemaSpec, content });
    const firstMount = document.createElement('div');
    const secondMount = document.createElement('div');
    document.body.append(firstMount, secondMount);
    const firstView = new EditorView(firstMount, first);
    const secondView = new EditorView(secondMount, second);

    firstView.focus('end');
    expect(document.activeElement).toBe(firstView.dom);
    expect(firstView.dom.contains(document.getSelection()?.anchorNode ?? null)).toBe(true);

    second.dispatch(second.state.createTransaction()
      .insertText([0, 0], 0, 'Remote ')
      .setSelection(EditorSelection.cursor([0, 0], 7))
      .setMeta(COLLABORATION_REMOTE_META, true));
    await Promise.resolve();
    expect(document.activeElement).toBe(firstView.dom);
    expect(firstView.dom.contains(document.getSelection()?.anchorNode ?? null)).toBe(true);

    firstView.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: '!',
    }));
    expect(first.getText()).toBe('Shared!');

    firstView.destroy();
    secondView.destroy();
  });

  it('captures and replaces a selection across differently marked text fragments', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A ' },
            { type: 'text', text: 'rough', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' draft' },
          ],
        }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const wrappers = view.dom.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const start = wrappers[0]?.firstChild;
    const end = wrappers[2]?.firstChild;
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    const range = document.createRange();
    range.setStart(start as Node, 2);
    range.setEnd(end as Node, 6);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'clean' }));

    expect(editor.getText()).toBe('A clean');
    expect(editor.state.selection.path).toEqual([0, 0]);
    expect(editor.state.selection.from).toBe(7);
    view.destroy();
  });

  it('captures and replaces a DOM selection across paragraphs', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
        ],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const wrappers = view.dom.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const range = document.createRange();
    range.setStart(wrappers[0]?.firstChild as Node, 6);
    range.setEnd(wrappers[1]?.firstChild as Node, 7);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'joined ' }));

    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.getText()).toBe('First joined paragraph');
    expect(editor.state.selection.eq(EditorSelection.cursor([0, 0], 13))).toBe(true);
    view.destroy();
  });

  it('preserves rich HTML from the clipboard', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/html' ? '<p><strong>Rich</strong> paste</p>' : 'Rich paste',
    } });
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(HTMLExporter.export(editor.state, { document: false })).toBe('<p><strong>Rich</strong> paste</p>');
    view.destroy();
  });

  it('embeds local images or delegates them to an upload adapter', async () => {
    const embedded = createEditor({ schema: CoreSchemaSpec });
    const file = new File(['image bytes'], 'launch.png', { type: 'image/png' });
    expect(await insertImageFile(embedded, file)).toBe(true);
    expect(embedded.state.doc.child(1).attrs.src).toMatch(/^data:image\/png;base64,/);
    expect(embedded.state.doc.child(1).attrs.alt).toBe('launch');

    const uploaded = createEditor({ schema: CoreSchemaSpec });
    expect(await insertImageFile(uploaded, file, { upload: async () => ({
      src: 'https://cdn.example.com/launch.png',
      alt: 'Uploaded launch',
      caption: 'A real storage adapter response',
    }) })).toBe(true);
    expect(uploaded.state.doc.child(1).attrs).toMatchObject({
      src: 'https://cdn.example.com/launch.png',
      alt: 'Uploaded launch',
      caption: 'A real storage adapter response',
    });
  });

  it('renders task controls that update the document model', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'task_list',
          content: [{
            type: 'task_item',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test the editor' }] }],
          }],
        }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const checkbox = view.dom.querySelector<HTMLInputElement>('[data-fountain-task-toggle]');
    expect(checkbox?.checked).toBe(false);
    if (checkbox) checkbox.checked = true;
    checkbox?.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe(true);
    expect(view.dom.querySelector<HTMLInputElement>('[data-fountain-task-toggle]')?.checked).toBe(true);
    view.destroy();
  });

  it('mounts and cleans up interactive node views supplied by extensions', () => {
    let destroyed = false;
    class PollNodeView {
      dom = document.createElement('section');
      constructor() {
        const button = document.createElement('button');
        button.textContent = 'Vote';
        button.dataset.pollVote = '';
        this.dom.appendChild(button);
      }
      destroy() { destroyed = true; }
    }
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'poll',
      nodes: { poll: { group: 'block', atom: true, nodeView: PollNodeView } },
    })]);
    const editor = createEditor({
      schema: kit.schema,
      content: { type: 'doc', content: [{ type: 'poll' }] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    expect(view.dom.querySelector('[data-poll-vote]')?.textContent).toBe('Vote');
    expect((view.dom.querySelector('[data-fountain-node="poll"]') as HTMLElement | null)?.contentEditable).toBe('false');
    view.destroy();
    expect(destroyed).toBe(true);
  });

  it('updates and remaps NodeViews with selection, event, and mutation contracts', async () => {
    let instances = 0;
    let updates = 0;
    let destroyed = 0;
    let selected = 0;
    let deselected = 0;
    let currentPath: number[] = [];
    let pluginClicks = 0;

    class CounterNodeView {
      dom = document.createElement('section');
      button = document.createElement('button');

      constructor(node: import('../src').Node, _view: unknown, getPath: () => number[]) {
        instances += 1;
        this.dom.dataset.counterView = '';
        this.button.dataset.counterButton = '';
        this.dom.appendChild(this.button);
        this.render(node);
        currentPath = getPath();
        this.button.addEventListener('click', () => { currentPath = getPath(); });
      }

      update(node: import('../src').Node): boolean {
        updates += 1;
        this.render(node);
        return true;
      }

      selectNode(): void {
        selected += 1;
        this.dom.dataset.hookSelected = 'true';
      }

      deselectNode(): void {
        deselected += 1;
        delete this.dom.dataset.hookSelected;
      }

      stopEvent(event: Event): boolean { return this.button.contains(event.target as globalThis.Node); }
      ignoreMutation(mutation: MutationRecord): boolean {
        return mutation.target === this.button || this.button.contains(mutation.target);
      }
      destroy(): void { destroyed += 1; }

      private render(node: import('../src').Node): void {
        this.button.textContent = `Count ${String(node.attrs.count)}`;
      }
    }

    const clickPlugin = new Plugin({ props: { handleClick: () => { pluginClicks += 1; return true; } } });
    const visualPlugin = new Plugin({
      props: {
        decorations: (state) => state.doc.child(0).type.name === 'counter' && state.doc.child(0).attrs.count === 0
          ? [Decoration.node(0, state.doc.child(0).nodeSize, {
            class: 'counter-pending',
            'data-counter-state': 'pending',
            style: 'outline-color: red',
          }, { key: 'counter-state' })]
          : [],
      },
    });
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'counter-node',
      nodes: {
        counter: {
          group: 'block',
          atom: true,
          attrs: { count: { default: 0, validate: (value) => Number.isInteger(value) } },
          nodeView: CounterNodeView,
        },
      },
      plugins: [clickPlugin, visualPlugin],
    })]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{ type: 'counter', attrs: { count: 0 } }, { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const original = view.dom.querySelector<HTMLElement>('[data-counter-view]');
    const button = original?.querySelector<HTMLButtonElement>('[data-counter-button]');
    expect(instances).toBe(1);
    expect(original?.classList.contains('counter-pending')).toBe(true);
    expect(original?.dataset.counterState).toBe('pending');

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(pluginClicks).toBe(0);
    expect(currentPath).toEqual([0]);

    expect(selectNode(editor, [0])).toBe(true);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(selected).toBe(1);
    expect(original?.dataset.hookSelected).toBe('true');

    expect(setNodeAttributes(editor, [0], { count: 1 })).toBe(true);
    expect(view.dom.querySelector('[data-counter-view]')).toBe(original);
    expect(button?.textContent).toBe('Count 1');
    expect(updates).toBe(1);
    expect(original?.classList.contains('counter-pending')).toBe(false);
    expect(original?.dataset.counterState).toBeUndefined();
    expect(original?.style.outlineColor).toBe('');

    const leading = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Before')]);
    editor.dispatch(editor.state.createTransaction().replace(0, 0, [leading]));
    expect(view.dom.querySelector('[data-counter-view]')).toBe(original);
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(currentPath).toEqual([1]);

    expect(selectText(editor, [0, 0], 0)).toBe(true);
    expect(deselected).toBe(1);
    expect(original?.dataset.hookSelected).toBeUndefined();

    if (button) button.dataset.localState = 'kept';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.dom.querySelector('[data-counter-view]')).toBe(original);

    const rogue = document.createElement('span');
    rogue.dataset.rogue = '';
    original?.appendChild(rogue);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.dom.querySelector('[data-rogue]')).toBeNull();
    expect(view.dom.querySelector('[data-counter-view]')).not.toBe(original);
    expect(instances).toBe(2);
    expect(destroyed).toBe(1);

    view.destroy();
    expect(destroyed).toBe(2);
  });

  it('recreates and destroys a NodeView when its update hook declines a changed node', () => {
    let instances = 0;
    let destroyed = 0;
    class StrictNodeView {
      dom = document.createElement('div');
      constructor(node: import('../src').Node) {
        instances += 1;
        this.dom.dataset.strictView = String(node.attrs.version);
      }
      update(): boolean { return false; }
      destroy(): void { destroyed += 1; }
    }
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'strict-node',
      nodes: {
        strict: {
          group: 'block', atom: true,
          attrs: { version: { default: 1, validate: (value) => Number.isInteger(value) } },
          nodeView: StrictNodeView,
        },
      },
    })]);
    const editor = createEditor({
      schema: kit.schema,
      content: { type: 'doc', content: [{ type: 'strict', attrs: { version: 1 } }] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const first = view.dom.querySelector('[data-strict-view]');

    expect(setNodeAttributes(editor, [0], { version: 2 })).toBe(true);
    const second = view.dom.querySelector('[data-strict-view]');
    expect(second).not.toBe(first);
    expect(second?.getAttribute('data-strict-view')).toBe('2');
    expect(instances).toBe(2);
    expect(destroyed).toBe(1);

    view.destroy();
    expect(destroyed).toBe(2);
  });

  it('reuses a NodeView contentDOM while refreshing its model-owned children', () => {
    let updates = 0;
    class CalloutNodeView {
      dom = document.createElement('aside');
      contentDOM = document.createElement('div');
      constructor() {
        this.dom.dataset.calloutView = '';
        this.contentDOM.dataset.calloutContent = '';
        this.dom.appendChild(this.contentDOM);
      }
      update(): boolean { updates += 1; return true; }
      stopEvent(event: Event): boolean { return !this.contentDOM.contains(event.target as globalThis.Node); }
    }
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'callout-node',
      nodes: { callout: { group: 'block', content: 'block+', nodeView: CalloutNodeView } },
    })]);
    const editor = createEditor({
      schema: kit.schema,
      content: {
        type: 'doc',
        content: [{ type: 'callout', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inside' }] }] }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const original = view.dom.querySelector('[data-callout-view]');

    expect(insertText(editor, '!')).toBe(true);
    expect(view.dom.querySelector('[data-callout-view]')).toBe(original);
    expect(view.dom.querySelector('[data-callout-content]')?.textContent).toBe('!Inside');
    expect(view.dom.querySelectorAll('[data-fountain-node="paragraph"]')).toHaveLength(1);
    expect(updates).toBe(1);
    view.destroy();
  });

  it('lets plugins intercept browser input, paste, drop, and click events', () => {
    const calls: string[] = [];
    const plugin = new Plugin({
      props: {
        handleBeforeInput: (editor, event) => {
          calls.push(`beforeinput:${event.inputType}`);
          insertText(editor, 'extension');
          return true;
        },
        handlePaste: () => { calls.push('paste'); return true; },
        handleDrop: () => { calls.push('drop'); return true; },
        handleClick: () => { calls.push('click'); return true; },
      },
    });
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [plugin] });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const beforeInput = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'ignored' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    view.dom.dispatchEvent(beforeInput);
    view.dom.dispatchEvent(paste);
    view.dom.dispatchEvent(drop);
    view.dom.dispatchEvent(click);
    expect(editor.getText()).toBe('extension');
    expect(calls).toEqual(['beforeinput:insertText', 'paste', 'drop', 'click']);
    expect([beforeInput, paste, drop, click].every((event) => event.defaultPrevented)).toBe(true);
    view.destroy();
  });

  it('renders mapped inline, node, and widget decorations without changing document JSON', () => {
    const decorationKey = new PluginKey<DecorationSet>('decorations');
    const caret = () => {
      const element = document.createElement('span');
      element.textContent = 'Remote';
      element.setAttribute('aria-label', 'Remote collaborator');
      return element;
    };
    const plugin = new Plugin<DecorationSet>({
      key: decorationKey,
      state: {
        init: (_config, state) => DecorationSet.create(state.doc, [
          Decoration.node(0, 12, { class: 'reviewed-block' }, { key: 'reviewed' }),
          Decoration.inline(1, 6, { class: 'search-match' }, { key: 'search' }),
          Decoration.inline(4, 10, { class: 'comment-range' }, { key: 'comment' }),
          Decoration.widget(6, caret, { key: 'remote-caret', side: 1 }),
        ]),
        apply: (transaction, value, _oldState, newState) => value.map(transaction.mapping, newState.doc),
      },
      props: { decorations: (state) => decorationKey.get(state) },
    });
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [plugin],
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha Beta' }] }] },
    });
    const before = editor.getJSON();
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    expect(view.dom.querySelector('.reviewed-block')?.textContent).toContain('Alpha');
    expect([...view.dom.querySelectorAll('.search-match')].map((node) => node.textContent)).toEqual(['Alp', 'ha']);
    expect([...view.dom.querySelectorAll('.comment-range')].map((node) => node.textContent)).toEqual(['ha', ' Bet']);
    expect(view.dom.querySelector('[data-fountain-widget="remote-caret"]')?.textContent).toBe('Remote');
    expect(editor.getJSON()).toEqual(before);

    insertText(editor, '!');
    expect([...view.dom.querySelectorAll('.search-match')].map((node) => node.textContent)).toEqual(['Alp', 'ha']);
    expect([...view.dom.querySelectorAll('.comment-range')].map((node) => node.textContent)).toEqual(['ha', ' Bet']);
    expect(view.dom.textContent).toContain('!AlphaRemote Beta');
    expect(editor.getText()).toBe('!Alpha Beta');
    view.destroy();
  });

  it('commits IME composition as one model update', () => {
    const update = vi.fn();
    const editor = createEditor({ schema: CoreSchemaSpec, onUpdate: update });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const text = view.dom.querySelector<HTMLElement>('[data-fountain-text-path]')?.firstChild;
    const range = document.createRange();
    range.setStart(text as Node, 0);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
    expect(editor.getText()).toBe('東京');
    expect(update).toHaveBeenCalledTimes(1);
    expect(editor.state.selection.eq(EditorSelection.cursor([0, 0], 2))).toBe(true);
    view.destroy();
  });

  it('groups adjacent browser typing and respects explicit and timed history boundaries', () => {
    vi.useFakeTimers();
    try {
      const editor = createEditor({
        schema: CoreSchemaSpec,
        plugins: [createHistoryPlugin({ depth: 10, newGroupDelay: 500 })],
      });
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      const view = new EditorView(mount, editor);
      const type = (value: string) => view.dom.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: value,
      }));

      type('a');
      vi.advanceTimersByTime(100);
      type('b');
      expect(editor.getText()).toBe('ab');
      expect(undo(editor)).toBe(true);
      expect(editor.getText()).toBe('');
      expect(redo(editor)).toBe(true);
      expect(editor.getText()).toBe('ab');

      closeHistory(editor);
      type('c');
      vi.advanceTimersByTime(501);
      type('d');
      expect(editor.getText()).toBe('abcd');
      expect(undo(editor)).toBe(true);
      expect(editor.getText()).toBe('abc');
      expect(undo(editor)).toBe(true);
      expect(editor.getText()).toBe('ab');
      view.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts composition commit ordering and mobile beforeinput variants exactly once', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()] });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
    view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertFromComposition', data: '東京',
    }));
    expect(editor.getText()).toBe('東京');

    editor.dispatch(editor.state.createTransaction().setSelection(new EditorSelection([0, 0], 0, 2)));
    const replacement = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: '京都',
    });
    view.dom.dispatchEvent(replacement);
    expect(replacement.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('京都');

    const undoEvent = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'historyUndo',
    });
    view.dom.dispatchEvent(undoEvent);
    expect(undoEvent.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('東京');
    view.destroy();
  });

  it('applies Markdown input rules and restores their literal trigger on Backspace', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '#' }));
    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
    expect(editor.state.doc.child(0).type.name).toBe('heading');
    expect(editor.getText()).toBe('');

    view.dom.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Backspace' }));
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
    expect(editor.getText()).toBe('# ');
    expect(editor.state.selection.eq(EditorSelection.cursor([0, 0], 2))).toBe(true);
    view.destroy();
  });

  it('uses stored formatting for IME composition', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    editor.dispatch(editor.state.createTransaction().setStoredMarks([editor.state.schema.mark('strong')]));
    view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
    expect(editor.state.doc.child(0).child(0).marks[0]?.type.name).toBe('strong');
    view.destroy();
  });

  it('exposes the editor as a framework-neutral custom element', () => {
    registerFountainElement({ tagName: 'test-fountain-editor' });
    const element = document.createElement('test-fountain-editor') as HTMLElement & {
      value: { type: string; content?: unknown[] };
      editor?: ReturnType<typeof createEditor>;
    };
    element.value = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Portable' }] }] };
    let changed = false;
    element.addEventListener('fountain-change', () => { changed = true; });
    document.body.appendChild(element);
    const textbox = element.querySelector<HTMLElement>('[role="textbox"]');
    expect(textbox?.textContent).toBe('Portable');
    textbox?.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '!' }));
    expect(changed).toBe(true);
    expect(element.editor?.getText()).toContain('!');
    element.remove();
  });
});
