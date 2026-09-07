<script lang="ts">
  import {
    StarterKit, Plugin, HTMLExporter, MarkdownExporter, canUndo, canRedo,
    undo, redo, toggleMark, toggleQuote, isMarkActive, isInsideNode, selectAll,
    insertList, insertTable, getActiveTableCell, addTableRow, addTableColumn,
    deleteTableRow, deleteTableColumn, deleteTable, selectTableRow, selectTableColumn,
    mergeTableCells, splitTableCell, toggleTableHeaderRow, toggleTableHeaderColumn,
    toggleTableHeaderCell, setMark, unsetMark, setTextAlignment, type Editor, type NodeJSON,
  } from 'fountainjs-editor';
  import { createFountain, fountainState, fountainEditor } from 'fountainjs-editor/svelte';

  let { content, lifecycle }: { content: NodeJSON; lifecycle: (event: 'created' | 'destroyed') => void } = $props();
  const editor = createFountain(() => ({
    schema: StarterKit.schema, content,
    plugins: [...StarterKit.plugins, new Plugin({ props: {
      onCreate: () => lifecycle('created'), onDestroy: () => lifecycle('destroyed'),
    } })],
  }));
  const snapshot = fountainState(editor);
  const options = { ariaLabel: 'Svelte report editor', placeholder: 'Write your report…' };
  let visible = $state(true);
  let format = $state<'json' | 'markdown' | 'html'>('json');
  let rows = $state(2), columns = $state(2), highlight = $state('#fff2a8');
  let doc = $derived($snapshot?.doc);
  let output = $derived(!doc ? '' : format === 'json' ? JSON.stringify(doc.toJSON(), null, 2)
    : format === 'markdown' ? MarkdownExporter.export(doc) : HTMLExporter.export(doc));
  let activeTable = $derived.by(() => { $snapshot; return $editor && getActiveTableCell($editor); });
  const commands: { label: string; run: (editor: Editor) => unknown; enabled?: (editor: Editor) => boolean; pressed?: (editor: Editor) => boolean }[] = [
    { label: 'Undo', run: undo, enabled: canUndo }, { label: 'Redo', run: redo, enabled: canRedo },
    { label: 'Bold', run: editor => toggleMark(editor, 'strong'), pressed: editor => isMarkActive(editor, 'strong') },
    { label: 'Quote', run: toggleQuote, pressed: editor => isInsideNode(editor, 'blockquote') },
    { label: 'Centre', run: editor => setTextAlignment(editor, 'center') },
    { label: 'Select all', run: selectAll }, { label: '+ Task', run: editor => insertList(editor, 'task', ['A new task']) },
  ];
  let buttons = $derived.by(() => { $snapshot; return commands.map(command => ({ ...command,
    disabled: !$editor || !visible || (command.enabled ? !command.enabled($editor) : false),
    pressed: command.pressed && $editor ? command.pressed($editor) : undefined,
  })); });
  const tableCommands: [string, (editor: Editor) => unknown][] = [
    ['Select row', selectTableRow], ['Select column', selectTableColumn],
    ['Merge selected cells', mergeTableCells], ['Split merged cell', splitTableCell],
    ['Add row above', editor => addTableRow(editor, 'before')], ['Add row below', editor => addTableRow(editor, 'after')],
    ['Delete row', deleteTableRow], ['Make/unmake header row', toggleTableHeaderRow],
    ['Add column left', editor => addTableColumn(editor, 'before')], ['Add column right', editor => addTableColumn(editor, 'after')],
    ['Delete column', deleteTableColumn], ['Make/unmake header column', toggleTableHeaderColumn],
    ['Make/unmake this cell a header', toggleTableHeaderCell], ['Delete entire table', deleteTable],
  ];
  function run(command: (editor: Editor) => unknown) { if ($editor) command($editor); }
  function keepSelection(event: MouseEvent) { event.preventDefault(); }
</script>

<div class="demo-workspace" data-svelte-report>
  <section class="demo-surface">
    <div class="surface-label"><span>LIVE SVELTE 5 + FOUNTAIN BINDINGS</span><i>Svelte owns the editor action, controls and store-driven inspector.</i></div>
    <div class="demo-controls" role="group" aria-label="Report commands">
      {#each buttons as button (button.label)}
        <button type="button" disabled={button.disabled} aria-pressed={button.pressed} onmousedown={keepSelection} onclick={() => run(button.run)}>{button.label}</button>
      {/each}
      <label class="demo-colour-control">Highlight <input type="color" aria-label="Highlight colour" bind:value={highlight} /></label>
      <button type="button" disabled={!$editor || !visible} onmousedown={keepSelection} onclick={() => run(editor => setMark(editor, 'highlight', { color: highlight }))}>Apply highlight</button>
      <button type="button" disabled={!$editor || !visible} onmousedown={keepSelection} onclick={() => run(editor => unsetMark(editor, 'highlight'))}>Remove highlight</button>
      <label>Rows <input type="number" aria-label="Table rows" min="1" max="20" bind:value={rows} /></label>
      <label>Columns <input type="number" aria-label="Table columns" min="1" max="20" bind:value={columns} /></label>
      <button type="button" disabled={!$editor || !visible || ![rows, columns].every(n => Number.isInteger(n) && n >= 1 && n <= 20)} onmousedown={keepSelection} onclick={() => run(editor => insertTable(editor, { rows, columns, headerRow: true }))}>+ Table</button>
      <button type="button" aria-pressed={!visible} onclick={() => visible = !visible}>{visible ? 'Hide editor' : 'Show editor'}</button>
    </div>
    {#if activeTable && visible}
      <details class="demo-controls svelte-table-tools">
        <summary>Table options</summary>
        <div class="demo-controls" role="group" aria-label="Table options">
          {#each tableCommands as [label, command] (label)}
            <button type="button" onmousedown={keepSelection} onclick={() => run(command)}
              disabled={(label === 'Merge selected cells' && !($snapshot?.selection.kind === 'cell' && $snapshot.selection.cellPaths.length > 1))
                || (label === 'Split merged cell' && activeTable.cell.colspan === 1 && activeTable.cell.rowspan === 1)}>{label}</button>
          {/each}
        </div>
      </details>
    {/if}
    {#if visible}
      <div class="bare-editor" use:fountainEditor={{ editor: $editor, options }}></div>
    {:else}
      <p class="svelte-report-hidden" role="status">Editor hidden — document and undo history retained. Choose Show editor to continue.</p>
    {/if}
    <p class="svelte-report-state" aria-label="Svelte document state">{doc?.childCount ?? 0} blocks · {doc?.textContent.length ?? 0} characters · Svelte store state</p>
  </section>
  <section class="demo-output" aria-label="Portable document data">
    <header><span><strong>Portable document data</strong><small>Developer inspection · not the reader UI</small></span></header>
    <nav aria-label="Document output format">
      {#each ['json', 'markdown', 'html'] as value}
        <button type="button" class:active={format === value} aria-pressed={format === value} onclick={() => format = value as typeof format}>{value}</button>
      {/each}
    </nav>
    <pre><code>{output}</code></pre>
  </section>
</div>
