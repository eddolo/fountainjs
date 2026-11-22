import { useEffect, useRef, useState } from 'react';
import { canRedo, canUndo, redo, undo } from 'fountainjs-editor';
import Vue from '../../../tools/gitlab-bridge/runtime';
import Surface from '../../../integrations/gitlab/components/fountain_editor_surface.vue?gitlab-vue2';
import { GitLabContentEditor } from '../../../integrations/gitlab/services/content_editor';
import tasks from '../../../integrations/gitlab/fixtures/task-live-html.json';
import outlines from '../../../integrations/gitlab/fixtures/toc-live-html.json';
import 'fountainjs-editor/styles.css';

const checklist = tasks.fixtures.find(row => row.name === 'plain')!;
const outline = outlines.cases.find(row => row.id === 'simple')!;
const samples = [
  { title: 'Release checklist', source: checklist.source, body: checklist.body },
  { title: 'Handoff notes', source: outline.source, body: outline.undecorated },
];

function Composer({ sample }: { sample: typeof samples[number] }) {
  const mount = useRef<HTMLDivElement>(null);
  const service = useRef<GitLabContentEditor | null>(null);
  const [markdown, setMarkdown] = useState(sample.source);
  const [error, setError] = useState('');
  const [history, setHistory] = useState({ undo: false, redo: false });

  useEffect(() => {
    const host = mount.current!;
    const adapter = new GitLabContentEditor({
      renderMarkdown: async source => {
        if (source !== sample.source) throw new Error('Only the captured starting document is available on this site.');
        return { body: sample.body };
      },
      describeLabels: (action, count) => `${action} ${count} labels`,
    });
    service.current = adapter;
    let view: InstanceType<typeof Vue> | undefined;
    let closed = false;
    const refresh = () => setHistory({ undo: canUndo(adapter.editor), redo: canRedo(adapter.editor) });
    const unsubscribe = adapter.subscribeChange(change => {
      if (change.status === 'ready') { setMarkdown(change.markdown); setError(''); }
      else setError('The adapter could not serialize this edit. Your draft is still in the editor.');
      refresh();
    });
    const showError = (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure));
    void adapter.setSerializedContent(sample.source).then(result => {
      if (closed || result.status !== 'applied') return;
      const options = { ariaLabel: sample.title + ' editor' };
      view = new Vue({ render: h => h(Surface, {
        props: { editor: adapter.editor, options, readSerializedContent: () => adapter.getSerializedContent() },
        on: { error: showError },
      }) }).$mount();
      host.appendChild(view.$el);
      refresh();
    }).catch(failure => { if (!closed) showError(failure); });
    return () => {
      closed = true;
      unsubscribe();
      view?.$destroy();
      host.replaceChildren();
      adapter.dispose();
      service.current = null;
    };
  }, [sample]);

  return <article className="gl-composer"><h3>{sample.title}</h3>
    <div className="gl-tools" aria-label={sample.title + ' controls'}>
      <button disabled={!history.undo} onClick={() => service.current && undo(service.current.editor)}>Undo</button>
      <button disabled={!history.redo} onClick={() => service.current && redo(service.current.editor)}>Redo</button>
    </div><div ref={mount} />
    {error && <p role="alert">{error}</p>}
    <details><summary>Inspect GitLab Markdown</summary><pre>{markdown}</pre></details>
  </article>;
}

export default function GitLabLiveEditors() {
  return <div className="gl-composers">{samples.map(sample => <Composer sample={sample} key={sample.title} />)}</div>;
}
