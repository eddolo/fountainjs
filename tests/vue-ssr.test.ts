// No jsdom: rendering must not create editor plugins, access DOM, or start providers.
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { expect, it, vi } from 'vitest';
import { Plugin, StarterKit } from '../src';
import { FountainDocumentField, FountainEditor, useFountain, useFountainState } from '../src/vue';

it('renders an inert Vue SSR host without evaluating the editor configuration', async () => {
  expect(typeof document).toBe('undefined');
  const factory = vi.fn(() => ({ schema: StarterKit.schema, plugins: StarterKit.plugins }));
  const App = defineComponent({ setup() {
    const editor = useFountain(factory);
    const state = useFountainState(editor);
    expect(editor.value).toBeNull();
    expect(state.value).toBeNull();
    return () => h(FountainEditor, { editor: editor.value });
  } });
  expect(await renderToString(createSSRApp(App))).toBe('<div data-fountain-root></div>');
  expect(factory).not.toHaveBeenCalled();
});

it('renders a disabled document field host without starting its editor on the server', async () => {
  const onCreate = vi.fn();
  const App = defineComponent({ setup: () => () => h(FountainDocumentField, {
    config: { schema: StarterKit.schema, plugins: [new Plugin({ props: { onCreate } })] },
    modelValue: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Local draft' }] }] },
    disabled: true,
  }) });
  expect(await renderToString(createSSRApp(App))).toBe('<div inert data-fountain-root></div>');
  expect(onCreate).not.toHaveBeenCalled();
});
