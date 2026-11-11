// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, createEditor, Decoration, DecorationSet, EditorView, HTMLExporter, Plugin, type NodeJSON, type SchemaSpec } from '../src';

const emptyStrong: NodeJSON = { type: 'text', text: '', marks: [{ type: 'strong' }] };
const emptyEmphasis: NodeJSON = { type: 'text', text: '', marks: [{ type: 'em' }] };
const left: NodeJSON = { type: 'text', text: 'left' };
const right: NodeJSON = { type: 'text', text: 'right' };
const cases: { name: string; content: NodeJSON[]; position: number }[] = [
  { name: 'leading empty run', content: [emptyStrong, right], position: 1 },
  { name: 'multiple leading empty runs', content: [emptyStrong, emptyEmphasis, right], position: 1 },
  { name: 'middle empty run', content: [left, emptyStrong, right], position: 5 },
  { name: 'multiple trailing empty runs', content: [left, emptyStrong, emptyEmphasis], position: 5 },
  { name: 'only empty runs', content: [emptyStrong, emptyEmphasis], position: 1 },
  { name: 'empty run before an atom', content: [emptyStrong, { type: 'boundary_token' }, right], position: 1 },
  { name: 'empty runs after a hard break', content: [left, { type: 'hard_break' }, emptyStrong, emptyEmphasis], position: 6 },
];

describe.each([-1, 1] as const)('view widget ownership with side %s', side => {
  it.each(cases)('renders one widget at $name without changing source runs', ({ content, position }) => {
    const schema: SchemaSpec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      boundary_token: { inline: true, group: 'inline', atom: true, toDOM: () => ['span', 'Token'] },
    } };
    const decorations = new Plugin({ props: { decorations: state => DecorationSet.create(state.doc, [
      Decoration.widget(position, () => {
        const label = document.createElement('span');
        label.textContent = 'Remote';
        return label;
      }, { key: 'boundary-peer', side }),
    ]) } });
    const editor = createEditor({ schema, plugins: [decorations], content: { type: 'doc', content: [{ type: 'paragraph', content }] } });
    const original = editor.getJSON();
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor);
    try {
      for (let pass = 0; pass < 2; pass++) {
        const widgets = view.dom.querySelectorAll('[data-fountain-widget="boundary-peer"]');
        expect(widgets).toHaveLength(1);
        expect(widgets[0]?.textContent).toBe('Remote');
        expect((widgets[0] as HTMLElement | undefined)?.contentEditable).toBe('false');
        expect(editor.getJSON()).toEqual(original);
        expect(HTMLExporter.export(editor.state.doc, { document: false })).not.toContain('Remote');
        editor.dispatch(editor.createTransaction().setMeta('force', true));
      }
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });
});
