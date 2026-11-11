import { createApp, defineComponent, h, ref, shallowRef } from 'vue';
import { FountainDocumentField, FountainEditor, useFountain, useFountainState } from 'fountainjs-editor/vue';
import {
  StarterKit, HTMLExporter, MarkdownExporter, insertList, insertTable,
  toggleMark, toggleQuote, undo, redo, canUndo, canRedo, isMarkActive, isInsideNode,
  getActiveTableCell, addTableRow, addTableColumn, deleteTableRow, deleteTableColumn,
  deleteTable, selectTableRow, selectTableColumn, mergeTableCells, splitTableCell,
  toggleTableHeaderRow, toggleTableHeaderColumn, toggleTableHeaderCell,
  setMark, unsetMark, setTextAlignment, selectAll, type Editor, type NodeJSON,
} from 'fountainjs-editor';
import type { DemoDefinition } from './demo-definitions';

const ReleaseReviewForm = defineComponent({
  setup() {
    const initial: NodeJSON = { type: 'doc', attrs: { workflow: 'release-review' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Confirm the rollback plan.' }] },
    ] };
    const model = shallowRef<NodeJSON | null>(initial);
    const disabled = ref(false);
    const submitted = shallowRef<Record<string, unknown> | null>(null);
    const config = { schema: StarterKit.schema, plugins: StarterKit.plugins };
    const options = {
      attributes: { 'aria-labelledby': 'vue-review-notes-label' },
      placeholder: 'Add a note for the release owner…',
    };
    const submit = (event: SubmitEvent) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const notes = data.get('notes');
      submitted.value = { release: data.get('release'), ...(typeof notes === 'string' ? { notes: JSON.parse(notes) } : {}) };
    };
    return () => h('section', { class: 'vue-document-form', 'aria-label': 'Release review form' }, [
      h('h2', 'Release review form'),
      h('form', { onSubmit: submit, onReset: () => { model.value = initial; disabled.value = false; submitted.value = null; } }, [
        h('label', ['Release', h('input', { name: 'release', defaultValue: 'November update', required: true })]),
        h('div', { class: 'vue-review-notes' }, [
          h('span', { id: 'vue-review-notes-label' }, 'Review notes'),
          h(FountainDocumentField, {
            class: 'bare-editor',
            config,
            options,
            disabled: disabled.value,
            modelValue: model.value,
            'onUpdate:modelValue': (value: NodeJSON) => { model.value = value; },
          }),
        ]),
        h('input', { type: 'hidden', name: 'notes', disabled: disabled.value || model.value === null, value: JSON.stringify(model.value) }),
        h('div', { class: 'demo-controls' }, [
          h('label', [h('input', {
            type: 'checkbox', checked: disabled.value,
            onChange: (event: Event) => { disabled.value = (event.target as HTMLInputElement).checked; },
          }), ' Disable review notes']),
          h('button', { type: 'button', disabled: disabled.value, onClick: () => { model.value = null; } }, 'Clear notes'),
          h('button', { type: 'reset' }, 'Reset review'),
          h('button', { type: 'submit' }, 'Preview submission'),
        ]),
      ]),
      submitted.value ? h('pre', { 'aria-label': 'Review submission payload', tabindex: 0 }, JSON.stringify(submitted.value, null, 2)) : null,
    ]);
  },
});

/** The gallery shell is React; everything inside this mount is rendered by Vue. */
export function mountVueRunbook(element: HTMLElement, demo: DemoDefinition): () => void {
  const app = createApp(defineComponent({
    name: 'FountainVueRunbook',
    setup() {
      const editor = useFountain(() => ({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: demo.content }));
      const state = useFountainState(editor);
      const visible = ref(true);
      const format = ref<'json' | 'markdown' | 'html'>('json');
      const rows = ref(2), columns = ref(2), highlight = ref('#fff2a8');
      // Stable options keep ordinary Vue re-renders from replacing the view.
      const options = { ariaLabel: 'Vue runbook editor', placeholder: 'Add release instructions…' };
      const command = (label: string, run: (editor: Editor) => unknown, enabled = true, pressed?: boolean) => h('button', {
        type: 'button', disabled: !editor.value || !visible.value || !enabled, 'aria-pressed': pressed,
        onMousedown: (event: MouseEvent) => event.preventDefault(),
        onClick: () => { if (editor.value) run(editor.value); },
      }, label);
      return () => {
        const doc = state.value?.doc;
        const activeTable = editor.value && getActiveTableCell(editor.value);
        const quote = Boolean(editor.value && isInsideNode(editor.value, 'blockquote'));
        const output = !doc ? '' : format.value === 'json' ? JSON.stringify(doc.toJSON(), null, 2)
          : format.value === 'markdown' ? MarkdownExporter.export(doc) : HTMLExporter.export(doc);
        const runbook = h('div', { class: 'demo-workspace', 'data-vue-runbook': '' }, [
          h('section', { class: 'demo-surface' }, [
            h('div', { class: 'surface-label' }, [h('span', 'LIVE VUE 3 + FOUNTAIN BINDINGS'), h('i', 'Vue owns this editor, toolbar, and document inspector.')]),
            h('div', { class: 'demo-controls', role: 'group', 'aria-label': 'Runbook commands' }, [
              command('Undo', undo, Boolean(editor.value && canUndo(editor.value))),
              command('Redo', redo, Boolean(editor.value && canRedo(editor.value))),
              command('Bold', editor => toggleMark(editor, 'strong'), true, Boolean(editor.value && isMarkActive(editor.value, 'strong'))),
              h('label', { class: 'demo-colour-control' }, ['Highlight', h('input', { type: 'color', 'aria-label': 'Highlight colour', value: highlight.value, onInput: (event: Event) => { highlight.value = (event.target as HTMLInputElement).value; } })]),
              command('Apply highlight', editor => setMark(editor, 'highlight', { color: highlight.value })),
              command('Remove highlight', editor => unsetMark(editor, 'highlight')),
              command('Centre', editor => setTextAlignment(editor, 'center')),
              command(quote ? 'Remove quote' : 'Quote', toggleQuote, true, quote),
              command('Select all', selectAll),
              command('+ Task', editor => insertList(editor, 'task', ['A new task'])),
              h('label', ['Rows ', h('input', { type: 'number', min: 1, max: 20, 'aria-label': 'Table rows', value: rows.value, onInput: (event: Event) => { rows.value = Number((event.target as HTMLInputElement).value); } })]),
              h('label', ['Columns ', h('input', { type: 'number', min: 1, max: 20, 'aria-label': 'Table columns', value: columns.value, onInput: (event: Event) => { columns.value = Number((event.target as HTMLInputElement).value); } })]),
              command('+ Table', editor => insertTable(editor, { rows: rows.value, columns: columns.value, headerRow: true }),
                [rows.value, columns.value].every(value => Number.isInteger(value) && value >= 1 && value <= 20)),
              h('button', { type: 'button', 'aria-pressed': !visible.value, onClick: () => { visible.value = !visible.value; } }, visible.value ? 'Hide editor' : 'Show editor'),
            ]),
            activeTable && visible.value ? h('details', { class: 'demo-controls vue-table-tools' }, [
              h('summary', 'Table options'),
              h('div', { class: 'demo-controls', role: 'group', 'aria-label': 'Table options' }, [
                command('Select row', selectTableRow), command('Select column', selectTableColumn),
                command('Merge selected cells', mergeTableCells, state.value?.selection.kind === 'cell' && state.value.selection.cellPaths.length > 1),
                command('Split merged cell', splitTableCell, activeTable.cell.colspan > 1 || activeTable.cell.rowspan > 1),
                command('Add row above', editor => addTableRow(editor, 'before')), command('Add row below', editor => addTableRow(editor, 'after')),
                command('Delete row', deleteTableRow), command('Make/unmake header row', toggleTableHeaderRow),
                command('Add column left', editor => addTableColumn(editor, 'before')), command('Add column right', editor => addTableColumn(editor, 'after')),
                command('Delete column', deleteTableColumn), command('Make/unmake header column', toggleTableHeaderColumn),
                command('Make/unmake this cell a header', toggleTableHeaderCell), command('Delete entire table', deleteTable),
              ]),
            ]) : null,
            visible.value ? h(FountainEditor, { editor: editor.value, options, class: 'bare-editor' })
              : h('p', { class: 'vue-runbook-hidden', role: 'status' }, 'Editor hidden — document and undo history retained. Choose Show editor to continue.'),
            h('p', { class: 'vue-runbook-state', 'aria-label': 'Vue document state' }, `${doc?.childCount ?? 0} blocks · ${doc?.textContent.length ?? 0} characters · Vue reactive state`),
          ]),
          h('section', { class: 'demo-output', 'aria-label': 'Portable document data' }, [
            h('header', [h('span', [h('strong', 'Portable document data'), h('small', 'Developer inspection · not the reader UI')])]),
            h('nav', { 'aria-label': 'Document output format' }, (['json', 'markdown', 'html'] as const).map(value => h('button', {
              type: 'button', class: format.value === value ? 'active' : '', 'aria-pressed': format.value === value,
              onClick: () => { format.value = value; },
            }, value))),
            h('pre', [h('code', output)]),
          ]),
        ]);
        return h('div', [runbook, h(ReleaseReviewForm)]);
      };
    },
  }));
  app.mount(element);
  return () => app.unmount();
}
