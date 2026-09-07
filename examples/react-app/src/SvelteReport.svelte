<script lang="ts">
  import type { DemoDefinition } from './demo-definitions';
  import SvelteReportEditor from './SvelteReportEditor.svelte';
  let { demo }: { demo: DemoDefinition } = $props();
  let session = $state(0), created = $state(0), destroyed = $state(0);
  function lifecycle(event: 'created' | 'destroyed') { if (event === 'created') created++; else destroyed++; }
</script>

<div class="svelte-lifecycle-demo">
  <div class="demo-controls">
    <button type="button" onclick={() => session++}>Reset report (discards edits)</button>
    <span aria-label="Editor lifecycle">Created: {created} · Destroyed: {destroyed}</span>
    <span>Local demo only. Reset replaces the component and its editor; hiding the view retains both.</span>
  </div>
  {#key session}<SvelteReportEditor content={demo.content} {lifecycle} />{/key}
</div>
