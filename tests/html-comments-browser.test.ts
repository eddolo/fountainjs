// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, createEditor, NodeSelection, type NodeSpec } from '../src/core';
import { EditorView } from '../src/view';
import { CoreSchemaSpec, HTMLCommentExtension } from '../src/extensions';
import { HTMLExporter } from '../src/core/exporters/html-exporter';
import { HTMLImporter } from '../src/core/importers/html-importer';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLCommentExtension.nodes } });
describe('browser/server inert comment agreement', () => {
  it.each([true, false])('respects an explicit empty text projection rather than copying the author UI (%j)', explicit => {
    const atom: NodeSpec = { group: 'inline', inline: true, atom: true,
      ...(explicit ? { toText: () => '' } : {}),
      toDOM: () => ['span', {}, 'Author controls'],
    };
    const editor = createEditor({ schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, test_atom: atom } },
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'test_atom' }] }] },
    });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0, 0])));
    const values = new Map<string, string>();
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { setData: (type: string, data: string) => values.set(type, data) } });
    try {
      view.dom.dispatchEvent(event);
      expect(values.get('text/plain')).toBe(explicit ? '' : 'Author controls');
      expect(event.defaultPrevented).toBe(true);
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });
  it.each(['<p>A<!-- a -->B</p>', '<p><strong>A<!-- b --></strong></p>', '<!-- top --><p>A</p>', '<p><!-- --><!-- --></p>'])('agrees for %s', source => {
    const browser = HTMLImporter.parse(source, schema);
    expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
    expect(HTMLImporter.parse(HTMLExporter.export(browser), schema).toJSON()).toEqual(browser.toJSON());
  });
  it('never executes markup stored inside a comment or turns it into real script elements', () => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.node('html_comment', { data: '<script>window.bad=1</script><img src=x onerror=bad()>' })])]);
    const parsed = new DOMParser().parseFromString(HTMLExporter.export(doc), 'text/html');
    expect(parsed.querySelectorAll('script,img')).toHaveLength(0);
    expect(parsed.querySelector('p')?.textContent).toBe('');
    expect((window as any).bad).toBeUndefined();
  });
});
