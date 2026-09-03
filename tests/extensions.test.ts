import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  CoreSchemaSpec,
  StarterKit,
  composeExtensions,
  createCommandManager,
  createEditor,
  defineExtension,
  inputRulesPlugin,
  insertText,
  markPasteRule,
  pasteRulesPlugin,
  textInputRule,
  textPasteRule,
  undoInputRule,
  wrappingPasteRule,
} from '../src';

function clipboardEvent(text: string, html = ''): ClipboardEvent {
  return {
    clipboardData: {
      getData: (type: string) => type === 'text/plain' ? text : type === 'text/html' ? html : '',
    },
  } as ClipboardEvent;
}

describe('modular extension composition', () => {
  it('combines custom nodes, commands, formats, and host services', () => {
    const callout = defineExtension({
      name: 'callout',
      nodes: {
        callout: {
          group: 'block',
          content: 'inline*',
          attrs: { tone: { default: 'info' } },
          toDOM: (node) => ['aside', { 'data-tone': node.attrs.tone }, 0],
        },
      },
      commands: {
        clearCallout: () => true,
        setCalloutTone: (_editor, tone: string) => tone === 'warning',
      },
      formats: { portable: { serialize: (document) => JSON.stringify(document.toJSON()) } },
      services: { analytics: { source: 'host-app' } },
    });
    const kit = composeExtensions([CoreExtension, callout]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [{ type: 'callout', content: [{ type: 'text', text: 'Extensible' }] }] },
    });

    expect(editor.state.doc.child(0).type.name).toBe('callout');
    expect(kit.commands.clearCallout?.(editor)).toBe(true);
    expect(kit.commands.setCalloutTone?.(editor, 'warning')).toBe(true);
    expect(kit.formats.portable?.serialize?.(editor.state.doc)).toContain('Extensible');
    expect(kit.services.analytics).toEqual({ source: 'host-app' });
  });

  it('rejects accidental contribution conflicts', () => {
    const conflicting = defineExtension({ name: 'other-paragraph', nodes: { paragraph: { group: 'block' } } });
    expect(() => composeExtensions([CoreExtension, conflicting])).toThrow('conflicts');
  });

  it('publishes built-in editing and history commands through the composed starter kit', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    expect(StarterKit.commands.insertText?.(editor, 'From the command registry')).toBe(true);
    expect(StarterKit.commands.toggleMark?.(editor, 'strong')).toBe(true);
    expect(StarterKit.commands.undo?.(editor)).toBe(true);
    expect(editor.getText()).toBe('');
  });

  it('lets extensions add reusable text input rules and undo the automatic replacement', () => {
    const rules = inputRulesPlugin({ rules: [
      textInputRule({ find: /-- $/, replace: '—', name: 'em-dash' }),
    ] });
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [rules] });
    insertText(editor, '--');
    const handled = rules.spec.props?.handleTextInput?.(editor, 2, 2, ' ');
    expect(handled).toBe(true);
    expect(editor.getText()).toBe('—');
    expect(undoInputRule(editor)).toBe(true);
    expect(editor.getText()).toBe('-- ');
  });

  it('commits a successful command chain atomically as one history event', () => {
    const updates: string[] = [];
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      onUpdate: (state) => updates.push(state.doc.textContent),
    });
    const manager = createCommandManager(editor, StarterKit.commands);

    expect(manager.chain().insertText('Hello').insertText(' world').run()).toBe(true);
    expect(editor.getText()).toBe('Hello world');
    expect(updates).toEqual(['Hello world']);
    expect(StarterKit.commands.undo?.(editor)).toBe(true);
    expect(editor.getText()).toBe('');
  });

  it('rolls back a chain when a command refuses and supports a named fallback', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const manager = createCommandManager(editor, {
      insertText,
      refuse: () => false,
    });

    expect(manager.chain().insertText('temporary').command('refuse').run()).toBe(false);
    expect(editor.getText()).toBe('');
  });

  it('checks individual commands and whole chains without changing editor state', () => {
    const updates: string[] = [];
    const editor = createEditor({
      schema: CoreSchemaSpec,
      onUpdate: (state) => updates.push(state.doc.textContent),
    });
    const manager = createCommandManager(editor, { insertText, refuse: () => false });

    expect(manager.can().insertText('preview')).toBe(true);
    expect(manager.can().chain().insertText('preview').run()).toBe(true);
    expect(manager.can().chain().insertText('preview').refuse().run()).toBe(false);
    expect(editor.getText()).toBe('');
    expect(updates).toEqual([]);
  });

  it('restores state when a command chain throws and supports reserved command names', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const manager = createCommandManager(editor, {
      insertText,
      chain: () => true,
      run: () => true,
      explode: () => { throw new Error('broken extension command'); },
    });

    expect(manager.can().command('chain')).toBe(true);
    expect(manager.chain().command('run').run()).toBe(true);
    expect(() => manager.chain().insertText('temporary').explode().run()).toThrow('broken extension command');
    expect(editor.getText()).toBe('');
  });

  it('applies every text paste-rule match across multiple pasted blocks', () => {
    const plugin = pasteRulesPlugin({ rules: [
      textPasteRule({ find: /--/g, replace: '—', name: 'em-dashes' }),
    ] });
    const editor = createEditor({ schema: StarterKit.schema, plugins: [...StarterKit.plugins, plugin] });

    expect(plugin.spec.props?.handlePaste?.(editor, clipboardEvent('one -- two --\nthree --'))).toBe(true);
    expect(editor.getText()).toBe('one — two —\nthree —');
    expect(StarterKit.commands.undo?.(editor)).toBe(true);
    expect(editor.getText()).toBe('');
  });

  it('creates marked fragments for every delimiter match in pasted text', () => {
    const plugin = pasteRulesPlugin({ rules: [
      markPasteRule({ find: /\*\*([^*]+)\*\*/g, mark: 'strong', name: 'strong-paste' }),
    ] });
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [plugin] });

    expect(plugin.spec.props?.handlePaste?.(editor, clipboardEvent('**one** and **two**'))).toBe(true);
    const inserted = editor.state.doc.child(0);
    expect(inserted.textContent).toBe('one and two');
    expect(inserted.content.filter((node) => node.marks.some((mark) => mark.type.name === 'strong')).map((node) => node.text)).toEqual(['one', 'two']);
  });

  it('wraps matching multiline paste through schema validation', () => {
    const plugin = pasteRulesPlugin({ rules: [
      wrappingPasteRule({ find: /^> /m, node: 'blockquote', name: 'quoted-paste' }),
    ] });
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [plugin] });

    expect(plugin.spec.props?.handlePaste?.(editor, clipboardEvent('> first\nsecond'))).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('blockquote');
    expect(editor.state.doc.child(1).textContent).toBe('> firstsecond');
  });
});
