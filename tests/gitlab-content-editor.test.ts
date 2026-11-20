import { afterEach, expect, it, vi } from 'vitest';
import { type FountainExtension, type Node, Selection, insertText, setTextAlignment, undo, redo } from 'fountainjs-editor';
import {
  GitLabContentEditor,
  GitLabEditorNotReady,
} from '../integrations/gitlab/services/content_editor';

import { insertGitLabContents } from '../integrations/gitlab/services/table_of_contents';

const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach((service) => service.dispose()));
function setup(renderMarkdown = vi.fn(async (text: string) => ({ body: `<p>${text}</p>` }))) {
  const service = new GitLabContentEditor({
    renderMarkdown,
    describeLabels: (_action, count) => `${count} labels`,
  });
  services.push(service);
  return { service, renderMarkdown };
}
function type(service: GitLabContentEditor, text: string) {
  const { editor } = service;
  editor.dispatch(
    editor
      .createTransaction()
      .setSelection(Selection.cursor([0, 0], editor.state.doc.child(0).textContent.length)),
  );
  expect(insertText(editor, text)).toBe(true);
}

it('keeps an extension-owned issue label through editing, undo, redo and reopening', async () => {
  const extension: FountainExtension = { name: 'issue-label', nodes: { label: {
    group: 'inline', inline: true, atom: true,
    attrs: {labelName: {default: ''}},
    parseHTML: [{tag: 'span[data-reference="label"]', getAttrs: el => ({labelName:el.getAttribute('data-label-name')})}],
    toDOM: node => ['span', {'data-reference':'label', 'data-label-name':node.attrs.labelName}, String(node.attrs.labelName)],
  } } };
  const toMarkdown = vi.fn((node:Node) => '~' + node.attrs.labelName);
  const renderMarkdown = vi.fn(async (source:string) => ({body: '<p>' + source.replace('~group::editor',
    '<span data-reference="label" data-label-name="group::editor">group::editor</span>') + '</p>'}));
  const options = {renderMarkdown, describeLabels:() => '', extensions:[extension], serializerConfig:{nodes:{label:{toMarkdown}}}};
  const service = new GitLabContentEditor(options);
  services.push(service);
  const original = 'this is a ~group::editor';
  await service.setSerializedContent(original);
  expect(service.editor.state.doc.child(0).child(1).type.name).toBe('label');
  expect(service.getSerializedContent()).toBe(original);
  expect(toMarkdown).not.toHaveBeenCalled();
  service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0,0], 0)));
  expect(insertText(service.editor, 'Edited: ')).toBe(true);
  expect(service.getSerializedContent()).toBe('Edited: ' + original);
  expect(undo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(original);
  expect(redo(service.editor)).toBe(true);
  const reopened = new GitLabContentEditor(options);
  services.push(reopened);
  await reopened.setSerializedContent(service.getSerializedContent());
  expect(reopened.editor.state.doc.child(0).child(1).attrs.labelName).toBe('group::editor');
  toMarkdown.mockImplementation(() => { throw new Error('Label source unavailable'); });
  expect(() => service.getSerializedContent()).toThrow(expect.objectContaining({ issues: [
    expect.objectContaining({code:'custom-node-source', path:[0, 1], message:'Label source unavailable'}),
  ] }));
  expect(undo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(original);
});
it('lets a block writer own its children while the surrounding GitLab quote retains multiline indentation', async () => {
  const write = vi.fn((node: Node) => 'SUMMARY\n' + node.textContent);
  const extension: FountainExtension = {name:'summary', nodes:{workflow_summary:{group:'block',content:'text*'}}};
  const service = new GitLabContentEditor({
    describeLabels:() => '', renderMarkdown:async () => ({body:'<p>Before</p>'}),
    extensions:[extension], serializerConfig:{nodes:{workflow_summary:{toMarkdown:write}}},
  });
  services.push(service);
  await service.setSerializedContent('Before');
  const {editor} = service;
  const schema = editor.state.schema;
  const summary = schema.node('workflow_summary', {}, [schema.text('Ready')]);
  const quote = schema.node('blockquote', {}, [summary]);
  expect(editor.dispatch(editor.createTransaction().replaceNode([0], [quote]))).toBe(true);
  expect(service.getSerializedContent()).toBe('> SUMMARY\n> Ready');
  expect(write).toHaveBeenCalledWith(summary);
});
it('writes attributed marks once across an inner bold range and preserves a refused edit for undo', async () => {
  const source = 'Press <kbd>A**B**C</kbd>.';
  const extension: FountainExtension = {name:'keyboard', marks:{shortcut:{
    attrs:{kind:{default:'kbd'}},
    parseHTML:[{tag:'kbd',priority:400}], toDOM:() => ['kbd',0],
  }}};
  const write = vi.fn(() => ({open:'<kbd>',close:'</kbd>'}));
  const options = {extensions:[extension], serializerConfig:{marks:{shortcut:{toMarkdown:write}}},
    describeLabels:() => '', renderMarkdown:async (text:string) => ({body:'<p>' + text.replace('**B**','<strong>B</strong>') + '</p>'})};
  const service = new GitLabContentEditor(options);
  services.push(service);
  await service.setSerializedContent(source);
  const content = service.editor.state.doc.child(0).content;
  expect(content.filter(node => node.marks.some(mark => mark.type.name === 'shortcut')).map(node => node.text)).toEqual(['A','B','C']);
  expect(service.getSerializedContent()).toBe(source);
  expect(write).not.toHaveBeenCalled();
  service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0,0],0)));
  expect(insertText(service.editor, 'Now: ')).toBe(true);
  expect(service.getSerializedContent()).toBe('Now: ' + source);
  write.mockImplementation(() => {throw new Error('Unknown keyboard format');});
  expect(() => service.getSerializedContent()).toThrow(expect.objectContaining({issues:expect.arrayContaining([
    expect.objectContaining({code:'custom-mark-source',message:'Unknown keyboard format'}),
  ])}));
  expect(undo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(source);
});
it('owns a native model without requiring DOM globals and reads only a loaded current document', async () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
  const { service } = setup();
  expect(service.status).toBe('unloaded');
  expect(() => service.getSerializedContent()).toThrow(GitLabEditorNotReady);
  await service.setSerializedContent('Original');
  expect(service.status).toBe('ready');
  expect(service.getSerializedContent()).toBe('Original');
  type(service, ' updated');
  expect(service.getSerializedContent()).toBe('Original updated');
  expect(undo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe('Original');
});

it('inserts an outline into a blank issue without saving its editable caret as authored paragraphs', async () => {
  const { service } = setup();
  await service.setSerializedContent('');
  expect(insertGitLabContents(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe('[[_TOC_]]');
  expect(undo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe('');
  expect(redo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe('[[_TOC_]]');
});

it('loads an empty new comment and retains the latest source for equal-document reloads', async () => {
  const { service, renderMarkdown } = setup();
  await expect(service.setSerializedContent('')).resolves.toEqual({ status: 'applied' });
  expect(renderMarkdown).not.toHaveBeenCalled();
  expect(service.status).toBe('ready');
  expect(service.getSerializedContent()).toBe('');
  type(service, 'Same');
  await service.setSerializedContent('Same');
  expect(undo(service.editor)).toBe(false);
  renderMarkdown.mockResolvedValueOnce({ body: '<p>Same</p>' });
  await service.setSerializedContent('Same\n');
  expect(service.getSerializedContent()).toBe('Same\n');
});

it('keeps templates undoable but establishes a new history baseline on reopen', async () => {
  const { service } = setup();
  await service.setSerializedContent('Original');
  type(service, ' updated');
  await service.setSerializedContent('Template', { addToHistory: true });
  expect(undo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe('Original updated');
  expect(redo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe('Template');
  await service.setSerializedContent('Reopened');
  expect(undo(service.editor)).toBe(false);
});

it('publishes edits rather than selection/load changes and supports status listeners reading current content', async () => {
  const { service } = setup();
  const changes = vi.fn(),
    statuses: string[] = [];
  service.subscribeChange(changes);
  service.subscribeStatus((status) => {
    statuses.push(status);
    if (status === 'ready') service.getSerializedContent();
  });
  await service.setSerializedContent('Original');
  expect(changes).not.toHaveBeenCalled();
  type(service, '!');
  expect(changes).toHaveBeenLastCalledWith({ status: 'ready', markdown: 'Original!' });
  expect(statuses).toEqual(['loading', 'ready']);
});

it('blocks stale values during a pending replacement and retains the visible document on conversion failure', async () => {
  const { service, renderMarkdown } = setup();
  await service.setSerializedContent('Original');
  let reject!: (error: Error) => void;
  renderMarkdown.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const replacement = service.setSerializedContent('Unconverted source');
  expect(service.status).toBe('loading');
  expect(() => service.getSerializedContent()).toThrow();
  reject(new Error('Server refused conversion'));
  await expect(replacement).rejects.toThrow();
  expect(service.editor.getText()).toBe('Original');
  expect(service.status).toBe('error');
  expect(service.recovery?.markdown).toBe('Unconverted source');
  expect(() => service.getSerializedContent()).toThrow();
  type(service, '!');
  expect(() => service.getSerializedContent()).toThrow();
  expect(service.keepCurrentDocument()).toBe('Original!');
  expect(service.getSerializedContent()).toBe('Original!');
  expect(service.recovery?.markdown).toBe('Unconverted source');
});

it('never treats an initial failed import as a successfully loaded empty document', async () => {
  const { service, renderMarkdown } = setup();
  renderMarkdown.mockRejectedValue(new Error('Offline'));
  await expect(service.setSerializedContent('Actual source')).rejects.toThrow();
  expect(() => service.getSerializedContent()).toThrow(GitLabEditorNotReady);
  expect(service.recovery?.markdown).toBe('Actual source');
});

it('does not let superseded responses clear the latest loading state or recovery source', async () => {
  const { service, renderMarkdown } = setup();
  await service.setSerializedContent('Original');
  let first!: (value: { body: string }) => void, second!: (value: { body: string }) => void;
  renderMarkdown.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        first = resolve;
      }),
  );
  renderMarkdown.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        second = resolve;
      }),
  );
  const old = service.setSerializedContent('Old request');
  const current = service.setSerializedContent('Current request');
  await expect(old).resolves.toEqual({ status: 'superseded' });
  expect(service.status).toBe('loading');
  first({ body: '<p>Old request</p>' });
  second({ body: '<p>Current request</p>' });
  await current;
  expect(service.getSerializedContent()).toBe('Current request');
  expect(service.recovery).toBeUndefined();
});

it('keeps a conflicting local edit and refuses to publish it as the requested replacement', async () => {
  const { service, renderMarkdown } = setup();
  await service.setSerializedContent('Original');
  let finish!: (value: { body: string }) => void;
  renderMarkdown.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const replace = service.setSerializedContent('Replacement');
  type(service, '!');
  finish({ body: '<p>Replacement</p>' });
  await expect(replace).rejects.toThrow();
  expect(service.editor.getText()).toBe('Original!');
  expect(() => service.getSerializedContent()).toThrow();
  expect(service.keepCurrentDocument()).toBe('Original!');
});

it('reports unsupported exports without breaking the model and recovers through undo', async () => {
  const { service } = setup();
  await service.setSerializedContent('Original');
  const changes = vi.fn();
  service.subscribeChange(changes);
  expect(setTextAlignment(service.editor, 'center')).toBe(true);
  expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  expect(service.status).toBe('error');
  expect(() => service.getSerializedContent()).toThrow();
  expect(undo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toBe('Original');
  expect(service.status).toBe('ready');
});

it.each([false, true])('mounts the production editor with the wiki source option set to %s', async preserveWikiSource => {
  const options = {renderMarkdown: async () => ({body:'<p>Ready</p>'}), describeLabels: () => '', preserveWikiSource};
  const service = new GitLabContentEditor(options);
  try {
    await service.setSerializedContent('Ready');
    expect(service.getSerializedContent()).toBe('Ready');
  } finally {
    service.dispose();
  }
  expect(() => new GitLabContentEditor({...options, preserveWikiSource: 'yes'} as never)).toThrow('EXPECTED_GITLAB_WIKI_SOURCE_FLAG');
});

it('rejects unsupported legacy provider/options instead of silently ignoring them', () => {
  expect(
    () =>
      new GitLabContentEditor({
        renderMarkdown: async () => ({ body: '' }),
        describeLabels: () => '',
        collaborationProvider: {},
      } as never),
  ).toThrow('UNSUPPORTED_GITLAB_NATIVE_OPTION:collaborationProvider');
  expect(
    () =>
      new GitLabContentEditor({
        renderMarkdown: async () => ({ body: '' }),
        describeLabels: () => '',
        extensions: [{ name: 'legacy', config: {} }],
      } as never),
  ).toThrow('EXPECTED_NATIVE_FOUNTAIN_EXTENSION');
});

it('disposes pending loads, the native model and subscriptions without later ready events', async () => {
  const { service, renderMarkdown } = setup();
  await service.setSerializedContent('Original');
  renderMarkdown.mockImplementationOnce(() => new Promise(() => {}));
  const pending = service.setSerializedContent('Pending');
  const status = vi.fn();
  service.subscribeStatus(status);
  service.dispose();
  service.dispose();
  await expect(pending).resolves.toEqual({ status: 'superseded' });
  expect(service.editor.isDestroyed).toBe(true);
  expect(service.status).toBe('destroyed');
  expect(status).toHaveBeenCalledExactlyOnceWith('destroyed');
  expect(() => service.getSerializedContent()).toThrow();
});

it('isolates failing host observers and error reporters so later model/view subscribers keep updating', async () => {
  const failure = new Error('Host observer failed');
  const reporter = vi.fn(() => {
    throw new Error('Reporter failed');
  });
  const service = new GitLabContentEditor({
    renderMarkdown: async (value) => ({ body: `<p>${value}</p>` }),
    describeLabels: () => '',
    onListenerError: reporter,
  });
  services.push(service);
  service.subscribeStatus(() => {
    throw failure;
  });
  service.subscribeChange(() => {
    throw failure;
  });
  const changes = vi.fn(),
    laterView = vi.fn();
  service.subscribeChange(changes);
  service.editor.subscribe(laterView);
  await service.setSerializedContent('Original');
  type(service, '!');
  expect(service.getSerializedContent()).toBe('Original!');
  expect(changes).toHaveBeenLastCalledWith({ status: 'ready', markdown: 'Original!' });
  expect(laterView).toHaveBeenCalled();
  expect(service.listenerError).toBe(failure);
  expect(reporter).toHaveBeenCalledWith(failure);
  expect(() => service.dispose()).not.toThrow();
});
