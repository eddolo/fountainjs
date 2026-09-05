/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  CoreSchemaSpec,
  HTMLImporter,
  MarkdownExporter,
  MarkdownImporter,
  Schema,
  Selection,
  createEditor,
  indentListItem,
  joinBackward,
  joinForward,
  outdentListItem,
  toggleList,
} from '../src';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const item = (text: string) => ({ type: 'list_item', content: [paragraph(text)] });

describe('professional list transforms', () => {
  it('wraps multiple text blocks and toggles the selected list range off', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          paragraph('First'),
          { type: 'heading', attrs: { level: 2, align: 'left' }, content: [{ type: 'text', text: 'Second' }] },
          paragraph('After'),
        ],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 1, [1, 0], 4)));
    expect(toggleList(editor, 'ordered')).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['ordered_list', 'paragraph']);
    expect(editor.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['First', 'Second']);
    expect(editor.state.selection.path).toEqual([0, 0, 0, 0]);
    expect(editor.state.selection.endPath).toEqual([0, 1, 0, 0]);

    expect(toggleList(editor, 'ordered')).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['First', 'Second', 'After']);
    expect(editor.state.selection.path).toEqual([0, 0]);
    expect(editor.state.selection.endPath).toEqual([1, 0]);
  });

  it('converts only the selected items and preserves lists on both sides', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'ordered_list', attrs: { start: 5 }, content: [item('A'), item('B'), item('C'), item('D')] }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 1, 0, 0], 0, [0, 2, 0, 0], 1)));
    expect(toggleList(editor, 'task')).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['ordered_list', 'task_list', 'ordered_list']);
    expect(editor.state.doc.child(0).attrs.start).toBe(5);
    expect(editor.state.doc.child(2).attrs.start).toBe(8);
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['B', 'C']);
    expect(editor.state.doc.child(1).content.every((node) => node.type.name === 'task_item' && node.attrs.checked === false)).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 0, 0, 0]);
    expect(editor.state.selection.endPath).toEqual([1, 1, 0, 0]);
  });

  it('indents multiple items into a different list kind and lifts them together', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'bullet_list', content: [item('A'), item('B'), item('C'), item('D')] }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 1, 0, 0], 0, [0, 2, 0, 0], 1)));
    expect(indentListItem(editor, 'ordered')).toBe(true);
    const outer = editor.state.doc.child(0);
    expect(outer.content.map((node) => node.textContent)).toEqual(['ABC', 'D']);
    expect(outer.child(0).child(1).type.name).toBe('ordered_list');
    expect(outer.child(0).child(1).content.map((node) => node.textContent)).toEqual(['B', 'C']);
    expect(editor.state.selection.path).toEqual([0, 0, 1, 0, 0, 0]);
    expect(editor.state.selection.endPath).toEqual([0, 0, 1, 1, 0, 0]);

    expect(outdentListItem(editor)).toBe(true);
    expect(editor.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(editor.state.selection.path).toEqual([0, 1, 0, 0]);
    expect(editor.state.selection.endPath).toEqual([0, 2, 0, 0]);
  });

  it('reparents trailing nested items under the final lifted item', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'bullet_list',
          content: [{
            ...item('Parent'),
            content: [paragraph('Parent'), { type: 'ordered_list', attrs: { start: 1 }, content: [item('A'), item('B'), item('C')] }],
          }],
        }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 1, 1, 0, 0], 1)));
    expect(outdentListItem(editor)).toBe(true);
    const outer = editor.state.doc.child(0);
    expect(outer.content.map((node) => node.textContent)).toEqual(['ParentA', 'BC']);
    expect(outer.child(0).child(1).content.map((node) => node.textContent)).toEqual(['A']);
    expect(outer.child(1).child(1).content.map((node) => node.textContent)).toEqual(['C']);
    expect(editor.state.selection.path).toEqual([0, 1, 0, 0]);
  });

  it('lifts the first item when Backspace is pressed at its start', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [{ type: 'bullet_list', content: [item('First'), item('Second')] }] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 0)));
    expect(joinBackward(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'bullet_list']);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['First', 'Second']);
  });

  it('joins around nested children and across adjacent top-level list boundaries', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'bullet_list', content: [
            { ...item('A'), content: [paragraph('A'), { type: 'ordered_list', attrs: { start: 1 }, content: [item('Nested')] }] },
            item('B'),
          ] },
        ],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 0)));
    expect(joinBackward(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).textContent).toBe('AB');
    expect(editor.state.doc.child(0).child(0).child(1).textContent).toBe('Nested');

    const adjacent = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'bullet_list', content: [item('A')] },
          { type: 'bullet_list', content: [item('C'), item('D')] },
          paragraph('After'),
        ],
      },
    });
    adjacent.dispatch(adjacent.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 1)));
    expect(joinForward(adjacent)).toBe(true);
    expect(adjacent.state.doc.content.map((node) => node.type.name)).toEqual(['bullet_list', 'paragraph']);
    expect(adjacent.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['AC', 'D']);
    adjacent.dispatch(adjacent.state.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 1)));
    expect(joinForward(adjacent)).toBe(true);
    expect(adjacent.state.doc.content.map((node) => node.type.name)).toEqual(['bullet_list']);
    expect(adjacent.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['AC', 'DAfter']);
  });

  it('imports direct item text, marks, and mixed nested HTML lists without flattening', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = HTMLImporter.parse(`
      <ul>
        <li>Parent <strong>bold</strong><ol start="3"><li>Nested one</li><li>Nested two</li></ol></li>
        <li>Sibling<ul data-type="task-list"><li data-checked="true"><input type="checkbox" checked>Done</li></ul></li>
      </ul>
    `, schema);
    const list = doc.child(0);
    expect(list.type.name).toBe('bullet_list');
    expect(list.child(0).child(0).textContent.trim()).toBe('Parent bold');
    expect(list.child(0).child(0).child(1).marks[0]?.type.name).toBe('strong');
    expect(list.child(0).child(1).type.name).toBe('ordered_list');
    expect(list.child(0).child(1).content.map((node) => node.textContent)).toEqual(['Nested one', 'Nested two']);
    expect(list.child(1).child(1).type.name).toBe('task_list');
    expect(list.child(1).child(1).child(0).attrs.checked).toBe(true);
    expect(list.child(1).child(1).child(0).textContent).toBe('Done');
  });

  it('round-trips mixed nested Markdown lists with starts, tasks, and inline marks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      '- Parent **bold**',
      '  3. Nested one',
      '  4. Nested two',
      '    - [x] Done',
      '- Sibling',
    ].join('\n');
    const doc = MarkdownImporter.parse(source, schema);
    const bullet = doc.child(0);
    expect(bullet.child(0).child(0).child(1).marks[0]?.type.name).toBe('strong');
    const ordered = bullet.child(0).child(1);
    expect(ordered.type.name).toBe('ordered_list');
    expect(ordered.attrs.start).toBe(3);
    expect(ordered.child(1).child(1).type.name).toBe('task_list');
    expect(ordered.child(1).child(1).child(0).attrs.checked).toBe(true);
    const markdown = MarkdownExporter.export(doc);
    expect(markdown).toContain('  3. Nested one');
    expect(markdown).toContain('    - [x] Done');
    expect(MarkdownImporter.parse(markdown, schema).eq(doc)).toBe(true);
  });

  it('preserves zero starts and limits ordered markers to nine digits', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '0. Zero\n1. One\n\n123456789. Valid\n\n1234567890. Literal';
    const doc = MarkdownImporter.parse(source, schema);

    expect(doc.content.map((node) => node.type.name)).toEqual([
      'ordered_list', 'ordered_list', 'paragraph',
    ]);
    expect(doc.child(0).attrs.start).toBe(0);
    expect(doc.child(1).attrs.start).toBe(123456789);
    expect(doc.child(2).textContent).toBe('1234567890. Literal');
    expect(MarkdownExporter.export(doc)).toBe(source);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).eq(doc)).toBe(true);

    const boundaryItem = (text: string) => schema.node('list_item', {}, [
      schema.node('paragraph', {}, [schema.text(text)]),
    ]);
    const boundary = schema.node('doc', {}, [schema.node('ordered_list', { start: 999999999 }, [
      boundaryItem('Max'), boundaryItem('Next'),
    ])]);
    const boundaryMarkdown = MarkdownExporter.export(boundary);
    expect(boundaryMarkdown).toBe('999999999. Max\n0. Next');
    expect(MarkdownImporter.parse(boundaryMarkdown, schema).eq(boundary)).toBe(true);
  });

  it('imports empty bullet and ordered items without requiring trailing whitespace', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '-\n- Filled\n\n1.\n2. Filled';
    const doc = MarkdownImporter.parse(source, schema);

    expect(doc.content.map((node) => node.type.name)).toEqual(['bullet_list', 'ordered_list']);
    expect(doc.child(0).content.map((node) => node.textContent)).toEqual(['', 'Filled']);
    expect(doc.child(1).content.map((node) => node.textContent)).toEqual(['', 'Filled']);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).eq(doc)).toBe(true);
  });
});
