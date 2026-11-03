import { useEffect, useRef, useState } from 'react';
import { MarkdownExporter, MarkdownImporter, Schema, StarterKit, type NodeJSON } from 'fountainjs-editor';
import { FountainComposer, FountainEditor, useFountain, useFountainState } from 'fountainjs-editor/react';
import { SitePageLink } from './SitePageLink';
import { WorkflowBreadcrumbs } from './WorkflowBreadcrumbs';

const initialTasks = [
  { id: 'brief', title: 'Write the launch brief', done: false, due: '', source: '## Launch brief\n\nExplain what changed and who it helps.\n\n- [ ] Add the release summary\n- [ ] Link the supporting evidence\n\nKeep the first version **short and useful**.' },
  { id: 'review', title: 'Review the technical notes', done: false, due: '', source: '## Technical review\n\nCheck the `parseWithSource` example and record anything unclear.\n\n> A good example should survive being copied into a real project.' },
  { id: 'share', title: 'Share the finished draft', done: true, due: '', source: '## Handoff\n\nOpen the reader preview, then download the description as Markdown.\n\nThis workspace is local; no message will be sent.' },
];
type Task = typeof initialTasks[number];
const toolbar = { groups: ['history', 'block-types', 'marks', 'insert', 'table'] as const,
  hiddenActions: ['media', 'upload-asset', 'text-style', 'text-color', 'clear-text-color', 'subscript', 'superscript', 'insert-table', 'image', 'upload-image'] as const };

function TaskReader({ content }: { content: NodeJSON }) {
  const reader = useFountain({ schema: StarterKit.schema, content, editable: false });
  return <FountainEditor editor={reader} ariaLabel="Task description preview" />;
}

function TaskPane({ task, active, update, remove }: { task: Task; active: boolean; update: (changes: Partial<Task>) => void; remove: () => void }) {
  const [content] = useState(() => MarkdownImporter.parse(task.source, new Schema(StarterKit.schema)).toJSON());
  const editor = useFountain({ schema: StarterKit.schema, content, plugins: StarterKit.plugins });
  const state = useFountainState(editor)!;
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('Draft kept in this tab while you switch tasks. Download before leaving.');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const result = MarkdownExporter.exportWithReport(state.doc);
  const save = () => {
    const url = URL.createObjectURL(new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${task.id}-description.md`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Downloaded this description. Task title, due date and completion are separate host data.');
  };
  const open = async (file: File) => {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a Markdown draft smaller than 2 MiB.');
      const doc = MarkdownImporter.parse(await file.text(), editor.state.schema);
      if (!doc.eq(editor.state.doc) && !editor.dispatch(editor.createTransaction().replaceDocument(doc))) throw new Error('The editor rejected this draft.');
      setPreview(false); setError(''); setMessage(`Opened ${file.name} in this task only. Undo restores its previous description.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section className="task-pane" hidden={!active} aria-label={`Task: ${task.title}`}>
    <div className="task-meta"><label>Task title<input value={task.title} maxLength={160} onChange={event => update({ title: event.target.value })} /></label><label>Due date<input type="date" value={task.due} onChange={event => update({ due: event.target.value })} /></label><div className="task-metadata-actions"><label className="task-complete"><input type="checkbox" checked={task.done} onChange={event => update({ done: event.target.checked })} /> Completed</label><button className="task-delete" onClick={remove}>Delete task</button></div></div>
    <div className="task-mode"><h2>Description</h2><button onClick={() => setPreview(!preview)}>{preview ? 'Edit description' : 'Reader preview'}</button></div>
    <div hidden={preview}><FountainComposer editor={editor} ariaLabel="Task description editor" toolbarProps={toolbar} /></div>
    {preview && <TaskReader content={state.doc.toJSON()} />}
    <div className="task-file-actions"><button onClick={save}>Download description</button><button onClick={() => input.current?.click()}>Open description</button><input ref={input} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden aria-label="Open task Markdown file" onChange={event => { const file = event.target.files?.[0]; if (file) void open(file); event.target.value = ''; }} /></div>
    {error && <p role="alert">{error}</p>}<p role="status">{message}</p>
    <dl className="task-diagnostics"><div><dt>Editor engine</dt><dd>FountainJS</dd></div><div><dt>Document blocks</dt><dd>{state.doc.childCount}</dd></div><div><dt>Markdown warnings</dt><dd>{result.losses.length}</dd></div><div><dt>Storage</dt><dd>This tab + downloaded files</dd></div></dl>
    {result.losses.length > 0 && <ul aria-label="Task export warnings">{result.losses.map((loss, index) => <li key={index}>{loss.detail}</li>)}</ul>}
  </section>;
}

export function TaskWorkflow() {
  const [tasks, setTasks] = useState(initialTasks);
  const [active, setActive] = useState('brief');
  const [removed, setRemoved] = useState<{ task: Task; index: number } | null>(null);
  const [notice, setNotice] = useState('');
  const taskButtons = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const nextFocus = useRef<string | null>(null);
  useEffect(() => {
    if (nextFocus.current === null) return;
    (taskButtons.current.get(nextFocus.current) ?? addButton.current)?.focus();
    nextFocus.current = null;
  }, [tasks, active, removed]);
  const addTask = () => {
    if (tasks.length >= 20) return;
    const id = crypto.randomUUID();
    setRemoved(null);
    setTasks([...tasks, { id, title: 'New task', done: false, due: '', source: 'Add the details your team needs.' }]);
    setActive(id); setNotice('Added a new task.'); nextFocus.current = id;
  };
  const removeTask = (id: string) => {
    const index = tasks.findIndex(task => task.id === id);
    if (index < 0) return;
    const task = tasks[index]!;
    const remaining = tasks.filter(value => value.id !== id);
    const next = remaining[Math.min(index, remaining.length - 1)]?.id ?? '';
    setTasks(remaining); setRemoved({ task, index }); setActive(next);
    setNotice(`Deleted ${task.title || 'Untitled task'}.`); nextFocus.current = next;
  };
  const restoreTask = () => {
    if (!removed || tasks.length >= 20) return;
    const restored = [...tasks]; restored.splice(removed.index, 0, removed.task);
    setTasks(restored); setActive(removed.task.id); nextFocus.current = removed.task.id;
    setNotice(`Restored ${removed.task.title || 'Untitled task'}.`); setRemoved(null);
  };
  // Retain one removed pane under its original React key. Undo deletion restores
  // the actual editor and its history, rather than reparsing an obsolete source.
  // Adding or deleting another task releases the previous removed pane.
  const retainedPanes = removed ? [...tasks, removed.task] : tasks;
  return <main className="task-site">
    <header className="site-header"><a className="brand" href="./"><span>F</span> FountainJS</a><nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./workflows.html">Workflows</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav></header>
    <div className="task-heading"><WorkflowBreadcrumbs current="Todoist-style task briefs (unofficial)" /><h1>A task needs more than a title.</h1><p>Edit a brief, switch tasks, and come back. Each description has its own document and undo history.</p></div>
    {notice && <div className="task-notice" role="status"><span>{notice}</span>{removed && <button onClick={restoreTask}>Undo delete</button>}</div>}
    <div className="task-workspace"><aside className="task-sidebar"><h2>Launch checklist</h2><p>{tasks.filter(task => task.done).length} of {tasks.length} completed</p><nav aria-label="Tasks">{tasks.map(task => <button key={task.id} ref={element => { if (element) taskButtons.current.set(task.id, element); else taskButtons.current.delete(task.id); }} aria-pressed={active === task.id} onClick={() => setActive(task.id)}><span aria-hidden="true">{task.done ? '✓' : '○'}</span>{task.title || 'Untitled task'}</button>)}</nav><button ref={addButton} className="task-add" disabled={tasks.length >= 20} onClick={addTask}>+ Add task</button><p>Local demo · up to 20 tasks</p></aside><div className="task-panes">{tasks.length === 0 && <section className="task-empty"><h2>No tasks</h2><p>Add a task to start a new brief, or undo the last deletion.</p><button onClick={addTask}>Add a task</button></section>}{retainedPanes.map(task => <TaskPane key={task.id} task={task} active={active === task.id} remove={() => removeTask(task.id)} update={changes => setTasks(current => current.map(value => value.id === task.id ? { ...value, ...changes } : value))} />)}</div></div>
    <section className="workflow-more"><h2>Build this workflow</h2><p>The host owns task titles, dates and completion. Fountain owns rich descriptions, formatting, selection and history. Keeping these small editor instances mounted preserves per-task undo when switching; larger lists should store inactive editor state instead. Reloading the page clears this local workspace.</p><p>This is not Todoist or a connected task manager. Accounts, shared persistence, notifications and permissions belong to the host. Read-only previews are presentation, not authorization. Imported links and images can contact external hosts.</p><div><a href="./workflows.html">All product workflows →</a><a href="https://github.com/eddolo/fountainjs/blob/master/docs/WORKFLOW_DEMOS.md">Implementation guide ↗</a><a href="https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/TaskWorkflow.tsx">Demo source ↗</a></div></section>
  </main>;
}
