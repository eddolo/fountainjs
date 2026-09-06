import { describe, expect, it } from 'vitest';
import {
  FOUNTAIN_EXTENSION_API_VERSION,
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
import {
  assertExtensionCompatibility,
  assertExtensionConformance,
  checkExtensionCompatibility,
  checkExtensionConformance,
} from '../src/testing';

function clipboardEvent(text: string, html = ''): ClipboardEvent {
  return {
    clipboardData: {
      getData: (type: string) => type === 'text/plain' ? text : type === 'text/html' ? html : '',
    },
  } as ClipboardEvent;
}

describe('modular extension composition', () => {
  it('validates versioned manifests and ordered extension requirements', () => {
    const base = defineExtension({
      name: 'example-base',
      manifest: { version: '1.2.0', apiVersion: FOUNTAIN_EXTENSION_API_VERSION },
    });
    const dependent = defineExtension({
      name: 'example-dependent',
      manifest: {
        version: '2.0.0-beta.1',
        apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
        homepage: 'https://example.com/extensions/dependent',
        requires: ['example-base'],
      },
    });

    expect(composeExtensions([CoreExtension, base, dependent]).getExtension('example-dependent')).toBe(dependent);
    expect(() => composeExtensions([CoreExtension, dependent])).toThrow('requires earlier extension');
    expect(() => defineExtension({
      name: 'bad-version',
      manifest: { version: 'latest', apiVersion: FOUNTAIN_EXTENSION_API_VERSION },
    })).toThrow('semantic version');
    expect(() => defineExtension({
      name: 'leading-zero-version',
      manifest: { version: '01.0.0', apiVersion: FOUNTAIN_EXTENSION_API_VERSION },
    })).toThrow('semantic version');
  });

  it('runs distributable extensions through the framework-neutral conformance contract', () => {
    const extension = defineExtension({
      name: 'callout-conformance',
      manifest: {
        version: '1.0.0',
        apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
        requires: ['fountain-core'],
      },
      nodes: {
        callout_conformance: { group: 'block', content: 'inline*', toDOM: () => ['aside', 0] },
      },
      commands: {
        appendBang: (editor) => insertText(editor, '!'),
      },
    });
    const document = {
      type: 'doc',
      content: [{ type: 'callout_conformance', content: [{ type: 'text', text: 'Hello' }] }],
    } as const;
    const report = assertExtensionConformance(extension, {
      documents: [{ name: 'callout', document }],
      commands: [{ name: 'appendBang', document, expectAccepted: true, expectDocumentChange: true }],
    });

    expect(report.passed).toBe(true);
    expect(report.inventory.nodes).toEqual(['callout_conformance']);
    expect(report.checks.every((check) => check.status === 'passed')).toBe(true);
  });

  it('reports all actionable extension conformance failures', () => {
    const report = checkExtensionConformance({ name: 'unfrozen-extension' });
    expect(report.passed).toBe(false);
    expect(report.checks.filter((check) => check.status === 'failed').map((check) => check.id)).toEqual([
      'manifest',
      'definition',
    ]);
    expect(() => assertExtensionConformance({ name: 'unfrozen-extension' })).toThrow('Use defineExtension');
  });

  it('diagnoses every problem in an ordered third-party extension installation', () => {
    const first = defineExtension({
      name: 'doctor-one',
      manifest: { version: '1.0.0', apiVersion: FOUNTAIN_EXTENSION_API_VERSION },
      commands: { sharedDoctorCommand: () => true },
    });
    const second = defineExtension({
      name: 'doctor-two',
      manifest: {
        version: '1.0.0',
        apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
        requires: ['not-installed'],
      },
      commands: { sharedDoctorCommand: () => true },
    });
    const report = checkExtensionCompatibility([first, second, first]);

    expect(report.passed).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      'missing-requirement',
      'contribution-conflict',
      'duplicate-extension',
      'contribution-conflict',
    ]);
    expect(() => assertExtensionCompatibility([first, second, first])).toThrow('not-installed');
  });

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

  it('defers to structured clipboard HTML instead of flattening it through text rules', () => {
    const plugin = pasteRulesPlugin({ rules: [
      textPasteRule({ find: /--/g, replace: '—' }),
    ] });
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(plugin.spec.props?.handlePaste?.(
      editor,
      clipboardEvent('rich -- source', '<p><strong>rich -- source</strong></p>'),
    )).toBe(false);
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
