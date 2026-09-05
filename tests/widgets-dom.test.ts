// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  EditorView,
  HTMLExporter,
  HTMLImporter,
  HistoryExtension,
  NodeSelection,
  Schema,
  composeExtensions,
  createEditor,
  undo,
} from '../src';
import { createDOMWidgetExtension } from '../src/widgets/dom';
import { defineWidget, updateWidget } from '../src/widgets';

const statusWidget = defineWidget({
  name: 'status_control',
  label: 'Incident status',
  attributes: {
    status: {
      default: 'Investigating',
      validate: (value) => value === 'Investigating' || value === 'Resolved',
    },
  },
  keyPolicy: { Enter: 'after' },
});

const content = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
    { type: 'status_control', attrs: { status: 'Investigating' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
  ],
} as const;

describe('DOM widget adapter', () => {
  it('keeps host controls mounted across updates and standardizes focus handoff', async () => {
    let mounts = 0;
    let updates = 0;
    let destroys = 0;
    const extension = createDOMWidgetExtension(statusWidget, (context) => {
      mounts += 1;
      const select = document.createElement('select');
      for (const value of ['Investigating', 'Resolved']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      }
      select.value = String(context.attributes.status);
      const unavailable = document.createElement('button');
      unavailable.disabled = true;
      unavailable.textContent = 'Unavailable';
      const onChange = () => context.set('status', select.value);
      select.addEventListener('change', onChange);
      context.controls.append(select, unavailable);
      return {
        update(next) {
          updates += 1;
          select.value = String(next.attributes.status);
        },
        destroy() {
          destroys += 1;
          select.removeEventListener('change', onChange);
        },
      };
    }, { className: 'status-widget' });
    const kit = composeExtensions([CoreExtension, extension, HistoryExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const outer = mount.querySelector<HTMLElement>('[data-fountain-widget-view="status_control"]');
    const select = outer?.querySelector<HTMLSelectElement>('select');
    const unavailable = outer?.querySelector<HTMLButtonElement>('button');

    expect(outer).toBeTruthy();
    expect(select?.value).toBe('Investigating');
    expect(unavailable?.disabled).toBe(true);
    expect(mounts).toBe(1);
    select!.focus();
    expect(document.activeElement).toBe(select);
    select!.value = 'Resolved';
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.state.doc.child(1).attrs.status).toBe('Resolved');
    expect(select?.value).toBe('Resolved');
    expect(unavailable?.disabled).toBe(true);
    expect(mounts).toBe(1);
    expect(mount.contains(select!)).toBe(true);
    expect(document.activeElement).toBe(select);
    expect(updates).toBeGreaterThan(0);

    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(1).attrs.status).toBe('Investigating');
    expect(mounts).toBe(1);
    expect(mount.contains(select!)).toBe(true);
    expect(select?.value).toBe('Investigating');
    expect(document.activeElement).toBe(select);

    select!.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    select!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(editor.state.selection).toMatchObject({ kind: 'text', path: [2, 0], from: 0 });
    await Promise.resolve();
    expect(document.activeElement).toBe(view.dom);

    select!.focus();
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    select!.dispatchEvent(backwards);
    expect(editor.state.selection).toMatchObject({ kind: 'text', path: [0, 0], from: 6 });

    select!.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    select!.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(editor.state.selection.path).toEqual([2, 0]);

    select!.focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    select!.dispatchEvent(escape);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([1]);

    view.destroy();
    editor.destroy();
    expect(destroys).toBe(1);
    mount.remove();
  });

  it('enforces read-only controls and prevents document changes', () => {
    let destroyed = false;
    const extension = createDOMWidgetExtension(statusWidget, (context) => {
      const button = document.createElement('button');
      button.textContent = String(context.attributes.status);
      button.addEventListener('click', () => context.set('status', 'Resolved'));
      context.controls.appendChild(button);
      return { destroy: () => { destroyed = true; } };
    });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content, editable: false });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const outer = mount.querySelector<HTMLElement>('[data-fountain-widget-view="status_control"]');
    const button = outer?.querySelector<HTMLButtonElement>('button');

    expect(outer?.getAttribute('aria-disabled')).toBe('true');
    expect(outer?.getAttribute('aria-invalid')).toBe('false');
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(editor.state.doc.child(1).attrs.status).toBe('Investigating');
    expect(updateWidget(editor, statusWidget, [1], { status: 'Resolved' })).toBe(false);

    view.destroy();
    expect(destroyed).toBe(true);
  });

  it('keeps editable child content in a separate Fountain-owned contentDOM', () => {
    const callout = defineWidget({
      name: 'callout_widget',
      label: 'Callout',
      content: 'block+',
      attributes: { tone: { default: 'info' } },
    });
    const extension = createDOMWidgetExtension(callout, (context) => {
      const label = document.createElement('button');
      label.textContent = String(context.attributes.tone);
      context.controls.appendChild(label);
    });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{
          type: 'callout_widget',
          attrs: { tone: 'warning' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Editable body' }] }],
        }],
      },
    });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const controls = mount.querySelector('[data-fountain-widget-controls]');
    const contentDOM = mount.querySelector('[data-fountain-widget-content]');

    expect(controls?.textContent).toBe('warning');
    expect(contentDOM?.textContent).toBe('Editable body');
    expect(controls?.contains(contentDOM)).toBe(false);
    expect(contentDOM?.querySelector('[data-fountain-node="paragraph"]')).toBeTruthy();

    view.destroy();
  });

  it('round-trips default widget state through safe semantic HTML', () => {
    const kit = composeExtensions([CoreExtension, createDOMWidgetExtension(statusWidget, () => {})]);
    const schema = new Schema(kit.schema);
    const source = schema.nodeFromJSON(content);
    const html = HTMLExporter.export(source, { document: false });

    expect(html).toContain('data-fountain-widget="status_control"');
    expect(html).toContain('data-fountain-widget-state=');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
  });
});
