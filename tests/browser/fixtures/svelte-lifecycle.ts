import { mount, tick, unmount } from 'svelte';
import type { Editor } from 'fountainjs-editor';
import Component from './SvelteLifecycle.svelte';

export async function auditSvelteLifecycle() {
  const events: string[] = [];
  const editors: Editor[] = [];
  const target = document.createElement('div'); document.body.append(target);
  try {
    for (let cycle = 0; cycle < 5; cycle++) {
      const component = mount(Component, { target, props: { events, capture: (editor: Editor) => editors.push(editor) } });
      await tick();
      if (target.querySelector('output')?.textContent !== 'Lifecycle report') throw new Error('State store did not update');
      await unmount(component);
      if (target.children.length) throw new Error('Unmount left DOM content');
    }
    return { events, destroyed: editors.map(editor => editor.isDestroyed) };
  } finally { target.remove(); editors.forEach(editor => editor.destroy()); }
}
