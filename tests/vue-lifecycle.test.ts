/** @vitest-environment jsdom */
import { createApp, createSSRApp, defineComponent, effectScope, h, isProxy, KeepAlive, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreExtension, StarterKit, composeExtensions, createCollaborationExtension, createEditor, insertText, undo, redo, type Editor } from '../src';
import { FountainEditor, useFountain, useFountainState, type FountainEditorHandle } from '../src/vue';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); });
function mount(component: ReturnType<typeof defineComponent>) {
  const element = document.createElement('div');
  document.body.append(element);
  const app = createApp(component);
  app.mount(element);
  const cleanup = () => { app.unmount(); element.remove(); };
  cleanups.push(cleanup);
  return { element, cleanup };
}

describe('Vue first-party lifecycle', () => {
  it('creates and disposes one unproxied engine/provider per mount, after the view', async () => {
    const connect = vi.fn(), disconnect = vi.fn(), destroy = vi.fn();
    const kit = composeExtensions([CoreExtension, createCollaborationExtension({ adapter: () => ({ connect, disconnect, destroy }) })]);
    const editors: Editor[] = [];
    for (let cycle = 1; cycle <= 10; cycle++) {
      const factory = vi.fn(() => ({ schema: kit.schema, plugins: kit.plugins }));
      const Harness = defineComponent({ setup() {
        const editor = useFountain(factory);
        const state = useFountainState(editor);
        return () => {
          if (editor.value && !editors.includes(editor.value)) editors.push(editor.value);
          expect(isProxy(editor.value)).toBe(false);
          expect(isProxy(state.value)).toBe(false);
          return h(FountainEditor, { editor: editor.value });
        };
      } });
      const harness = mount(Harness);
      await nextTick();
      expect(factory).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledTimes(cycle);
      expect(harness.element.querySelector('[role=textbox]')).not.toBeNull();
      cleanups.pop()!();
      expect(editors[cycle - 1].isDestroyed).toBe(true);
      expect(disconnect).toHaveBeenCalledTimes(cycle);
      expect(destroy).toHaveBeenCalledTimes(cycle);
    }
  });

  it('reacts to transactions/history without remounting the editable DOM', async () => {
    let engine!: Editor;
    const Harness = defineComponent({ setup() {
      const editor = useFountain({ schema: StarterKit.schema, plugins: StarterKit.plugins });
      const state = useFountainState(editor);
      return () => {
        if (editor.value) engine = editor.value;
        return h('section', [h(FountainEditor, { editor: editor.value }), h('output', state.value?.doc.textContent)]);
      };
    } });
    const { element } = mount(Harness);
    await nextTick();
    const textbox = element.querySelector('[role=textbox]');
    expect(insertText(engine, 'Release checked')).toBe(true);
    await nextTick();
    expect(element.querySelector('output')?.textContent).toBe('Release checked');
    expect(element.querySelector('[role=textbox]')).toBe(textbox);
    undo(engine); await nextTick();
    expect(element.querySelector('output')?.textContent).toBe('');
    redo(engine); await nextTick();
    expect(element.querySelector('output')?.textContent).toBe('Release checked');
  });

  it('unsubscribes on editor replacement, null, and scope disposal without owning external editors', () => {
    const first = createEditor({ schema: StarterKit.schema });
    const second = createEditor({ schema: StarterKit.schema });
    cleanups.push(() => { first.destroy(); second.destroy(); });
    const source = shallowRef<Editor | null>(first);
    const scope = effectScope();
    const state = scope.run(() => useFountainState(source))!;
    insertText(first, 'First'); expect(state.value).toBe(first.state);
    source.value = second;
    insertText(first, ' stale'); expect(state.value).toBe(second.state);
    insertText(second, 'Second'); expect(state.value).toBe(second.state);
    source.value = null; expect(state.value).toBeNull();
    source.value = first; scope.stop();
    insertText(first, ' detached'); expect(state.value).toBeNull();
    expect(first.isDestroyed || second.isDestroyed).toBe(false);
  });

  it('replaces external views, forwards options/attributes/focus and does not destroy supplied engines', async () => {
    const first = createEditor({ schema: StarterKit.schema });
    const second = createEditor({ schema: StarterKit.schema, editable: false });
    cleanups.push(() => { first.destroy(); second.destroy(); });
    const source = shallowRef<Editor | null>(first);
    const surface = shallowRef<FountainEditorHandle | null>(null);
    const options = shallowRef({ ariaLabel: 'Vue document', placeholder: 'Write here' });
    const Harness = defineComponent({ setup: () => () => h(FountainEditor, { editor: source.value, options: options.value, ref: surface, class: 'custom-host' }) });
    const { element } = mount(Harness); await nextTick();
    expect(element.querySelector('.custom-host [aria-label="Vue document"]')).not.toBeNull();
    const old = surface.value!.view!.dom;
    surface.value!.focus('start');
    expect(document.activeElement).toBe(old);
    source.value = second; await nextTick();
    expect(old.isConnected).toBe(false);
    expect(surface.value!.view!.dom.contentEditable).toBe('false');
    options.value = { ariaLabel: 'Reader document', placeholder: 'Read here' }; await nextTick();
    expect(element.querySelector('[aria-label="Reader document"]')).not.toBeNull();
    source.value = null; await nextTick();
    expect(surface.value!.view).toBeNull();
    expect(element.querySelector('[role=textbox]')).toBeNull();
    cleanups.pop()!();
    expect(first.isDestroyed || second.isDestroyed).toBe(false);
  });

  it('requires lifecycle scopes instead of silently leaking unowned editors/subscriptions', () => {
    expect(() => useFountain({ schema: StarterKit.schema })).toThrow('setup()');
    expect(() => useFountainState(null)).toThrow('effect scope');
  });

  it('hydrates the inert SSR host and then mounts the editable view once', async () => {
    const element = document.createElement('div');
    element.innerHTML = '<div data-fountain-root></div>';
    document.body.append(element);
    const factory = vi.fn(() => ({ schema: StarterKit.schema, plugins: StarterKit.plugins }));
    const warnings = vi.spyOn(console, 'warn');
    const app = createSSRApp(defineComponent({ setup() {
      const editor = useFountain(factory);
      return () => h(FountainEditor, { editor: editor.value });
    } }));
    app.mount(element); await nextTick();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll('[role=textbox]')).toHaveLength(1);
    expect(warnings).not.toHaveBeenCalled();
    app.unmount(); element.remove(); warnings.mockRestore();
  });

  it('keeps one owned engine through KeepAlive deactivation and destroys it on final removal', async () => {
    const show = shallowRef(true);
    let engine!: Editor;
    const factory = vi.fn(() => ({ schema: StarterKit.schema, plugins: StarterKit.plugins }));
    const Child = defineComponent({ setup() {
      const editor = useFountain(factory);
      return () => { if (editor.value) engine = editor.value; return h(FountainEditor, { editor: editor.value }); };
    } });
    const Harness = defineComponent({ setup: () => () => h(KeepAlive, null, { default: () => show.value ? h(Child) : null }) });
    const { element } = mount(Harness); await nextTick();
    insertText(engine, 'Cached work');
    show.value = false; await nextTick();
    expect(engine.isDestroyed).toBe(false);
    expect(element.querySelector('[role=textbox]')).toBeNull();
    show.value = true; await nextTick();
    expect(element.querySelector('[role=textbox]')?.textContent).toBe('Cached work');
    expect(factory).toHaveBeenCalledTimes(1);
    cleanups.pop()!(); expect(engine.isDestroyed).toBe(true);
  });
});
