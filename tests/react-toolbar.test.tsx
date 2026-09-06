/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  composeExtensions,
  createEditor,
  insertText,
  selectText,
  TableMap,
} from '../src';
import {
  FountainComposer,
  FountainToolbar,
  FountainToolbarButton,
  FountainToolbarGroup,
  FountainToolbarRoot,
} from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('React toolbar primitives', () => {
  it('runs pointer and keyboard activation once while preserving accessible state', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);
    const run = vi.fn();

    await act(async () => root.render(
      <FountainToolbarRoot label="Document actions">
        <FountainToolbarGroup label="Marks">
          <FountainToolbarButton actionId="strong" label="Strong emphasis" icon={<span>icon</span>} active onAction={run} />
        </FountainToolbarGroup>
      </FountainToolbarRoot>,
    ));

    const toolbar = mount.querySelector<HTMLElement>('[role="toolbar"]');
    const button = mount.querySelector<HTMLButtonElement>('button');
    expect(toolbar?.getAttribute('aria-label')).toBe('Document actions');
    expect(mount.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Marks');
    expect(button?.getAttribute('aria-label')).toBe('Strong emphasis');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('data-fountain-toolbar-action')).toBe('strong');

    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, detail: 1 });
    await act(async () => {
      button?.dispatchEvent(pointerDown);
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    });
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    const touchDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, detail: 1 });
    Object.defineProperty(touchDown, 'pointerType', { value: 'touch' });
    await act(async () => {
      button?.dispatchEvent(touchDown);
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    });
    expect(touchDown.defaultPrevented).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);

    await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })));
    expect(run).toHaveBeenCalledTimes(3);

    await act(async () => root.unmount());
    mount.remove();
  });

  it('navigates enabled controls with wrapping arrows and Home/End in LTR and RTL', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);

    await act(async () => root.render(
      <FountainToolbarRoot label="Navigation test" style={{ direction: 'ltr' }}>
        <FountainToolbarButton label="First" onAction={() => undefined} />
        <FountainToolbarButton label="Unavailable" disabled onAction={() => undefined} />
        <FountainToolbarButton label="Last" onAction={() => undefined} />
      </FountainToolbarRoot>,
    ));
    const toolbar = mount.querySelector<HTMLElement>('[role="toolbar"]')!;
    const first = mount.querySelector<HTMLButtonElement>('[aria-label="First"]')!;
    const last = mount.querySelector<HTMLButtonElement>('[aria-label="Last"]')!;
    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);

    toolbar.style.direction = 'rtl';
    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);

    await act(async () => root.unmount());
    mount.remove();
  });
});

describe('supplied React toolbar composition', () => {
  it('chooses table dimensions and deletes the active table from supplied controls', async () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);
    await act(async () => root.render(<FountainToolbar editor={editor} groups={['insert', 'table']} />));

    const open = mount.querySelector<HTMLButtonElement>('[aria-label="Insert table"]')!;
    await act(async () => open.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, detail: 1 })));
    const rows = mount.querySelector<HTMLInputElement>('[aria-label="Table rows"]')!;
    const columns = mount.querySelector<HTMLInputElement>('[aria-label="Table columns"]')!;
    const setValue = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => { setValue(rows, '4'); setValue(columns, '5'); });
    const insert = [...mount.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Insert')!;
    await act(async () => insert.click());
    expect(editor.state.doc.child(1).type.name).toBe('table');
    expect(TableMap.create(editor.state.doc.child(1)).height).toBe(4);
    expect(TableMap.create(editor.state.doc.child(1)).width).toBe(5);

    const remove = mount.querySelector<HTMLButtonElement>('[aria-label="Delete entire table"]')!;
    expect(remove.disabled).toBe(false);
    await act(async () => remove.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, detail: 1 })));
    expect(editor.state.doc.content.some((node) => node.type.name === 'table')).toBe(false);

    await act(async () => root.unmount());
    editor.destroy();
    mount.remove();
  });

  it('applies the complete text-style suite through one accessible panel', async () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    insertText(editor, 'Style this text');
    selectText(editor, [0, 0], 0, 10);
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);
    await act(async () => root.render(<FountainToolbar editor={editor} groups={['marks']} />));

    const styles = mount.querySelector<HTMLButtonElement>('[aria-label="Text styles"]')!;
    await act(async () => styles.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, detail: 1 })));
    expect(styles.getAttribute('aria-pressed')).toBe('true');
    expect(mount.querySelector('.is-text-style strong')?.textContent).toBe('Text styles');
    expect(mount.querySelector<HTMLInputElement>('[aria-label="Text colour"]')?.type).toBe('color');
    expect(mount.querySelector<HTMLInputElement>('[aria-label="Background colour"]')?.type).toBe('color');

    const family = mount.querySelector<HTMLInputElement>('[aria-label="Font family"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(family, 'Atkinson Hyperlegible, sans-serif');
      family.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const applyFont = [...mount.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Apply font')!;
    expect(applyFont.disabled).toBe(false);
    await act(async () => applyFont.click());
    const marks = editor.state.doc.child(0).content.flatMap((node) => node.marks);
    expect(marks.find((mark) => mark.type.name === 'font_family')?.attrs.family).toBe('Atkinson Hyperlegible, sans-serif');
    expect(editor.state.selection.path).toEqual([0, 0]);
    expect(editor.state.selection.from).toBe(0);
    expect(editor.state.selection.to).toBe(10);

    const removeFont = [...mount.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Remove font')!;
    await act(async () => removeFont.click());
    expect(editor.state.doc.child(0).content.flatMap((node) => node.marks).some((mark) => mark.type.name === 'font_family')).toBe(false);

    await act(async () => root.unmount());
    editor.destroy();
    mount.remove();
  });

  it('configures group/action order, visibility, labels, icons, and rendering by stable IDs', async () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);

    await act(async () => root.render(<FountainToolbar
      editor={editor}
      groups={['marks', 'history']}
      actionOrder={{ marks: ['underline', 'bold'] }}
      hiddenActions={['italic']}
      groupLabels={{ marks: 'Our text styles' }}
      actionLabels={{ bold: 'Strong emphasis' }}
      actionIcons={{ bold: <span data-custom-bold>Custom B</span> }}
      renderAction={({ actionId, defaultControl }) => actionId === 'bold'
        ? <span data-action-wrapper="bold">{defaultControl}</span>
        : defaultControl}
    />));

    expect([...mount.querySelectorAll('[data-fountain-toolbar-group]')].map((group) => group.getAttribute('data-fountain-toolbar-group'))).toEqual(['marks', 'history']);
    expect(mount.querySelector('[data-fountain-toolbar-group="marks"]')?.getAttribute('aria-label')).toBe('Our text styles');
    const markActions = [...mount.querySelectorAll('[data-fountain-toolbar-group="marks"] [data-fountain-toolbar-action]')]
      .map((control) => control.getAttribute('data-fountain-toolbar-action'));
    expect(markActions.slice(0, 2)).toEqual(['underline', 'bold']);
    expect(markActions).not.toContain('italic');
    expect(mount.querySelector('[aria-label="Strong emphasis"] [data-custom-bold]')?.textContent).toBe('Custom B');
    expect(mount.querySelector('[data-action-wrapper="bold"]')).not.toBeNull();
    expect(mount.querySelector('[data-fountain-toolbar-group="block-types"]')).toBeNull();
    expect([...mount.querySelectorAll('input[type="file"]')].every((input) => input.getAttribute('aria-hidden') === 'true' && input.getAttribute('tabindex') === '-1')).toBe(true);
    const underline = mount.querySelector<HTMLButtonElement>('[aria-label="Underline"]')!;
    const search = mount.querySelector<HTMLButtonElement>('[aria-label="Find and replace"]')!;
    underline.focus();
    await act(async () => underline.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(search);

    await act(async () => {
      insertText(editor, 'Make this strong');
      selectText(editor, [0, 0], 0, 9);
    });
    const bold = mount.querySelector<HTMLButtonElement>('[aria-label="Strong emphasis"]')!;
    await act(async () => bold.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, detail: 1 })));
    expect(editor.state.selection.path).toEqual([0, 0]);
    expect(editor.state.selection.endPath).toEqual([0, 0]);
    expect(editor.state.selection.from).toBe(0);
    expect(editor.state.selection.to).toBe(9);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe('strong');

    await act(async () => root.unmount());
    editor.destroy();
    mount.remove();
  });

  it('passes toolbar customization through the starter composer', async () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);

    await act(async () => root.render(<FountainComposer
      editor={editor}
      blockHandles
      toolbarProps={{ groups: ['block-types'], hiddenActions: ['heading-2'] }}
    />));
    expect(mount.querySelectorAll('[data-fountain-toolbar-group]')).toHaveLength(1);
    expect(mount.querySelector('[data-fountain-toolbar-action="paragraph"]')).not.toBeNull();
    expect(mount.querySelector('[data-fountain-toolbar-action="heading-2"]')).toBeNull();
    expect(mount.querySelector('[data-fountain-block-controls]')).not.toBeNull();

    await act(async () => root.unmount());
    editor.destroy();
    mount.remove();
  });
});
