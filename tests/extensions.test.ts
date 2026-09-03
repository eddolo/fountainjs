import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  StarterKit,
  composeExtensions,
  createEditor,
  defineExtension,
} from '../src';

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
});
