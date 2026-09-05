// @vitest-environment jsdom

import { act } from 'react';
import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  EditorView,
  composeExtensions,
  createEditor,
  selectNode,
} from '../src';
import {
  createReactWidgetExtension,
  type ReactWidgetProps,
} from '../src/react/widgets';
import { defineWidget } from '../src/widgets';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ratingWidget = defineWidget({
  name: 'rating_field',
  label: 'Rating',
  attributes: {
    rating: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 },
  },
});

function Rating({ attributes, selected, editable, set, getPath, validation }: ReactWidgetProps) {
  return <div>
    <output data-rating-output>
      {String(attributes.rating)} · {selected ? 'selected' : 'idle'} · {editable ? 'editable' : 'read only'} · {getPath().join('.')} · {validation.valid ? 'valid' : 'invalid'}
    </output>
    <button data-increase-rating onClick={() => set('rating', Number(attributes.rating) + 1)}>Increase</button>
    <button data-business-disabled disabled>Unavailable</button>
  </div>;
}

const content = {
  type: 'doc',
  content: [
    { type: 'rating_field', attrs: { rating: 2 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
  ],
} as const;

describe('React widget adapter', () => {
  it('projects portable state, selection, paths, commands, and cleanup into React', async () => {
    const extension = createReactWidgetExtension(ratingWidget, Rating, { className: 'rating-widget' });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    let view: EditorView;
    await act(async () => { view = new EditorView(mount, editor); });
    const wrapper = view!.dom.querySelector('[data-fountain-widget-view="rating_field"]');
    const output = () => view!.dom.querySelector('[data-rating-output]')?.textContent ?? '';

    expect(output()).toContain('2 · idle · editable · 0 · valid');
    expect(view!.dom.querySelector<HTMLButtonElement>('[data-business-disabled]')?.disabled).toBe(true);
    await act(async () => { view!.dom.querySelector<HTMLButtonElement>('[data-increase-rating]')?.click(); });
    expect(editor.state.doc.child(0).attrs.rating).toBe(3);
    expect(output()).toContain('3 · idle');
    expect(view!.dom.querySelector<HTMLButtonElement>('[data-business-disabled]')?.disabled).toBe(true);
    expect(view!.dom.querySelector('[data-fountain-widget-view="rating_field"]')).toBe(wrapper);

    await act(async () => { selectNode(editor, [0]); });
    expect(output()).toContain('3 · selected');

    const leading = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Before')]);
    await act(async () => { editor.dispatch(editor.state.createTransaction().replace(0, 0, [leading])); });
    expect(view!.dom.querySelector('[data-fountain-widget-view="rating_field"]')).toBe(wrapper);
    await act(async () => { view!.dom.querySelector<HTMLButtonElement>('[data-increase-rating]')?.click(); });
    expect(editor.state.doc.child(1).attrs.rating).toBe(4);
    expect(output()).toContain('· 1 · valid');

    await act(async () => { view!.destroy(); });
    expect(mount.querySelector('[data-fountain-widget-view]')).toBeNull();
    mount.remove();
  });

  it('renders React widgets read-only and disables nested form controls', async () => {
    const kit = composeExtensions([CoreExtension, createReactWidgetExtension(ratingWidget, Rating)]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content, editable: false });
    const mount = document.createElement('div');
    let view: EditorView;
    await act(async () => { view = new EditorView(mount, editor); });
    const button = view!.dom.querySelector<HTMLButtonElement>('[data-increase-rating]');

    expect(view!.dom.querySelector('[data-rating-output]')?.textContent).toContain('read only');
    expect(button?.disabled).toBe(true);
    await act(async () => { button?.click(); });
    expect(editor.state.doc.child(0).attrs.rating).toBe(2);

    await act(async () => { view!.destroy(); });
  });
});
