<script lang="ts">
  import { CoreSchemaSpec, Plugin, type Editor } from 'fountainjs-editor';
  import { createFountain, fountainState, fountainEditor } from 'fountainjs-editor/svelte';
  let { events, capture }: { events: string[]; capture: (editor: Editor) => void } = $props();
  let engine: Editor;
  const editor = createFountain(() => ({
    schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      paragraph: { ...CoreSchemaSpec.nodes.paragraph, nodeView: class {
        dom = document.createElement('p');
        contentDOM = this.dom;
        constructor() { events.push('view:create'); }
        destroy() { events.push(`view:destroy:engine-${engine.isDestroyed ? 'dead' : 'alive'}`); }
      } },
    } },
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lifecycle report' }] }] },
    plugins: [new Plugin({ props: {
      onCreate: value => { engine = value; capture(value); events.push('engine:create'); },
      onDestroy: () => events.push('engine:destroy'),
    } })],
  }));
  const snapshot = fountainState(editor);
</script>
<div use:fountainEditor={{ editor: $editor }}></div>
<output>{$snapshot?.doc.textContent ?? 'inert'}</output>
