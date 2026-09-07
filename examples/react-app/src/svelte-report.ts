import { mount, unmount } from 'svelte';
import SvelteReport from './SvelteReport.svelte';
import type { DemoDefinition } from './demo-definitions';

export function mountSvelteReport(target: HTMLElement, demo: DemoDefinition): () => void {
  const app = mount(SvelteReport, { target, props: { demo } });
  return () => { void unmount(app); };
}
