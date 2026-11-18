import { Editor as TiptapEditor } from '@tiptap/core';
import TiptapStarterKit from '@tiptap/starter-kit';
import { EditorView, StarterKit, composeExtensions, createEditor } from 'fountainjs-editor';

const query = new URLSearchParams(location.search);
const engine = query.get('engine');
const size = Number(query.get('size'));
if (!['tiptap', 'fountain'].includes(engine) || !Number.isSafeInteger(size) || size < 1) {
  throw new Error('Supply an editor and a positive number of paragraphs.');
}
const content = { type: 'doc', content: Array.from({ length: size }, (_, index) => ({
  type: 'paragraph', content: [{ type: 'text', text: 'Paragraph ' + index }]
})) };
const mount = document.getElementById('editor');
let editor;
if (engine === 'tiptap') {
  editor = new TiptapEditor({ element: mount, extensions: [TiptapStarterKit], content });
} else {
  const kit = composeExtensions(StarterKit.extensions);
  editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  new EditorView(mount, editor, { ariaLabel: 'Editor' });
}

const timings = [];
const events = [];
const observer = new PerformanceObserver(list => {
  for (const e of list.getEntriesByName('keydown')) {
    events.push({ start: e.startTime, duration: e.duration, interactionId: e.interactionId,
      processingStart: e.processingStart, processingEnd: e.processingEnd });
  }
});
observer.observe({ type: 'event', durationThreshold: 16, buffered: true });

document.addEventListener('keydown', event => {
  if (!event.isTrusted || !/^[a-z]$/.test(event.key) || event.ctrlKey || event.metaKey) return;
  const sample = { key: event.key, start: event.timeStamp };
  timings.push(sample);
  // A next-frame task is an observable rendering opportunity. Only Event Timing
  // supplies a browser presentation metric, and it censors fast events.
  requestAnimationFrame(() => setTimeout(() => {
    sample.frameTask = performance.now();
  }, 0));
}, { capture: true });
window.probe = {
  timings, events,
  texts: () => editor.getJSON().content.map(node => node.content?.map(part => part.text).join('') ?? ''),
};
