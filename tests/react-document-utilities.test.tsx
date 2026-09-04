/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CoreExtension, EditorView, composeExtensions, createEditor, insertText } from '../src';
import {
  createCharacterCountExtension,
  createMentionExtension,
  createSlashCommandExtension,
  type CharacterCountService,
  type MentionItem,
  type MentionService,
  type SlashCommandService,
} from '../src/document-utilities';
import { FountainCharacterCount, FountainSlashCommandMenu, FountainSuggestionMenu } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('React document utility primitives', () => {
  it('renders accessible async suggestions beside the query and a live count', async () => {
    const mentions = createMentionExtension({
      suggestions: [{
        char: '@',
        items: ({ query }) => [
          { id: 'ada', label: 'Ada Lovelace' },
          { id: 'alan', label: 'Alan Turing' },
        ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
      }],
    });
    const counting = createCharacterCountExtension({ limit: 40 });
    const kit = composeExtensions([CoreExtension, mentions, counting]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const editorMount = document.createElement('div');
    const reactMount = document.createElement('div');
    document.body.append(editorMount, reactMount);
    const view = new EditorView(editorMount, editor);
    const controller = (kit.services.mentions as MentionService).getController(editor);
    const count = kit.services.characterCount as CharacterCountService;
    const root = createRoot(reactMount);

    await act(async () => {
      root.render(<>
        <FountainSuggestionMenu<MentionItem>
          controller={controller}
          label="Mention someone"
          anchorElement={view.dom}
        />
        <FountainCharacterCount editor={editor} service={count} />
      </>);
    });
    expect(reactMount.querySelector('[aria-label="Mention someone"]')).toBeNull();
    expect(reactMount.querySelector('.fountain-character-count')?.textContent).toContain('0 / 40 characters');

    await act(async () => {
      insertText(editor, '@a');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.dom.querySelector('[data-fountain-suggestion-query="@"]')).not.toBeNull();
    const listbox = reactMount.querySelector<HTMLElement>('[role="listbox"]');
    expect(listbox?.getAttribute('aria-label')).toBe('Mention someone');
    expect(view.dom.getAttribute('aria-expanded')).toBe('true');
    expect(view.dom.getAttribute('aria-haspopup')).toBe('listbox');
    expect(view.dom.getAttribute('aria-autocomplete')).toBe('list');
    expect(view.dom.getAttribute('aria-controls')).toBe(listbox?.id);
    expect(reactMount.querySelectorAll('[role="option"]')).toHaveLength(2);
    const firstOption = reactMount.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    expect(firstOption?.textContent).toBe('Ada Lovelace');
    expect(view.dom.getAttribute('aria-activedescendant')).toBe(firstOption?.id);
    expect(reactMount.querySelector('.fountain-suggestion-menu')?.getAttribute('style')).toContain('position: fixed');

    await act(async () => {
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    const secondOption = reactMount.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    expect(secondOption?.textContent).toBe('Alan Turing');
    expect(view.dom.getAttribute('aria-activedescendant')).toBe(secondOption?.id);
    await act(async () => {
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(editor.getText()).toBe('@Alan Turing ');
    expect(reactMount.querySelector('.fountain-character-count')?.textContent).toContain('13 / 40 characters');
    expect(reactMount.querySelector('[aria-label="Mention someone"]')).toBeNull();
    expect(view.dom.hasAttribute('aria-expanded')).toBe(false);
    expect(view.dom.hasAttribute('aria-controls')).toBe(false);
    expect(view.dom.hasAttribute('aria-activedescendant')).toBe(false);

    await act(async () => root.unmount());
    view.destroy();
    editor.destroy();
    editorMount.remove();
    reactMount.remove();
  });

  it('renders the slash registry as accessible labelled groups', async () => {
    const slash = createSlashCommandExtension();
    const kit = composeExtensions([CoreExtension, slash]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const editorMount = document.createElement('div');
    const reactMount = document.createElement('div');
    document.body.append(editorMount, reactMount);
    const view = new EditorView(editorMount, editor);
    const service = kit.services.slashCommands as SlashCommandService;
    const root = createRoot(reactMount);

    await act(async () => {
      root.render(<FountainSlashCommandMenu editor={editor} service={service} anchorElement={view.dom} />);
      insertText(editor, '/');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reactMount.querySelectorAll('[role="option"]')).toHaveLength(11);
    const labelledGroups = [...reactMount.querySelectorAll('[role="group"]')]
      .map((group) => group.getAttribute('aria-labelledby'));
    expect(labelledGroups).toHaveLength(4);
    expect(labelledGroups.every(Boolean)).toBe(true);
    expect([...reactMount.querySelectorAll('.fountain-suggestion-menu__group-label')].map((label) => label.textContent)).toEqual([
      'Text', 'Lists', 'Blocks', 'Insert',
    ]);
    expect(reactMount.querySelector('.fountain-slash-command-menu__copy')?.textContent).toContain('Write ordinary body text.');
    expect(view.dom.getAttribute('aria-controls')).toBe(reactMount.querySelector('[role="listbox"]')?.id);

    await act(async () => root.unmount());
    view.destroy();
    editor.destroy();
    editorMount.remove();
    reactMount.remove();
  });
});
