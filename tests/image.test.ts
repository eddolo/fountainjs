// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CoreSchemaSpec,
  EditorView,
  HTMLExporter,
  HTMLImporter,
  MarkdownExporter,
  MarkdownImporter,
  NodeSelection,
  Plugin,
  Selection,
  createEditor,
  deleteImage,
  getActiveImage,
  imageFileToDataURL,
  insertImage,
  insertInlineImage,
  insertText,
  setImageAlignment,
  setImageAttributes,
  startImageUpload,
} from '../src';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

describe('production image editing', () => {
  it('inserts, updates, validates, projects, and round-trips responsive block images', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertImage(editor, {
      src: 'https://cdn.example.com/hero.jpg',
      alt: 'Launch illustration',
      title: 'Launch',
      caption: 'A responsive launch image',
      width: '640px',
      height: 'auto',
      align: 'right',
      srcset: 'https://cdn.example.com/hero-small.jpg 480w, https://cdn.example.com/hero.jpg 1200w',
      sizes: '(max-width: 700px) 100vw, 640px',
      loading: 'eager',
      decoding: 'sync',
    })).toBe(true);
    const image = editor.state.doc.child(1);
    expect(image.textContent).toBe('[Image: Launch illustration]');
    expect(image.attrs).toMatchObject({ width: '640px', align: 'right', loading: 'eager', decoding: 'sync' });
    expect(setImageAttributes(editor, { width: '50vw', caption: 'Edited' }, [1])).toBe(true);
    expect(setImageAlignment(editor, 'left', [1])).toBe(true);
    expect(setImageAttributes(editor, { width: '10px;position:fixed' }, [1])).toBe(false);
    expect(setImageAttributes(editor, { srcset: 'javascript:alert(1) 2x' }, [1])).toBe(false);

    const html = HTMLExporter.export(editor.state, { document: false });
    expect(html).toContain('data-align="left"');
    expect(html).toContain('srcset="https://cdn.example.com/hero-small.jpg 480w, https://cdn.example.com/hero.jpg 1200w"');
    expect(html).toContain('sizes="(max-width: 700px) 100vw, 640px"');
    const imported = HTMLImporter.parse(html, editor.state.schema);
    expect(imported.child(1).attrs).toMatchObject({
      src: 'https://cdn.example.com/hero.jpg',
      caption: 'Edited',
      width: '50vw',
      align: 'left',
      loading: 'eager',
      decoding: 'sync',
    });
  });

  it('supports true inline images with selection, deletion, HTML, and Markdown interchange', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(insertInlineImage(editor, {
      src: 'https://cdn.example.com/icon.png', alt: 'Status', width: '1.25em', height: '1.25em',
    })).toBe(true);
    expect(editor.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['text', 'inline_image', 'text']);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(getActiveImage(editor)?.inline).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('he![Status](https://cdn.example.com/icon.png)llo');
    const html = HTMLExporter.export(editor.state, { document: false });
    expect(html).toContain('data-fountain-inline-image="true"');
    const fromHTML = HTMLImporter.parse(html, editor.state.schema);
    expect(fromHTML.child(0).content.map((node) => node.type.name)).toEqual(['text', 'inline_image', 'text']);
    const fromMarkdown = MarkdownImporter.parse(MarkdownExporter.export(editor.state), editor.state.schema);
    expect(fromMarkdown.child(0).content.map((node) => node.type.name)).toEqual(['text', 'inline_image', 'text']);
    expect(deleteImage(editor)).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('hello');
    expect(editor.state.selection.kind).toBe('text');
  });

  it('maps an asynchronous upload destination through edits and reports progress', async () => {
    let appendOnce = true;
    const append = new Plugin({
      appendTransaction: (transactions, _oldState, newState) => {
        if (!appendOnce || !transactions.some((transaction) => transaction.docChanged)) return null;
        appendOnce = false;
        const prefix = newState.schema.node('paragraph', {}, [newState.schema.text('Appended')]);
        return newState.createTransaction().replace(0, 0, [prefix]);
      },
    });
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [append] });
    const result = deferred<{ src: string; alt: string }>();
    const states: string[] = [];
    const task = startImageUpload(editor, new File(['image'], 'mapped.png', { type: 'image/png' }), {
      upload: async (_file, context) => {
        context.reportProgress(.25);
        return result.promise;
      },
      onStatusChange: snapshot => states.push(`${snapshot.status}:${snapshot.progress}`),
    });
    expect(task.snapshot).toMatchObject({ status: 'uploading', progress: .25, attempt: 1 });
    expect(insertText(editor, 'Typed while uploading')).toBe(true);
    result.resolve({ src: 'https://cdn.example.com/mapped.png', alt: 'Mapped result' });
    await expect(task.completion).resolves.toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph', 'image_super']);
    expect(editor.state.doc.child(0).textContent).toBe('Appended');
    expect(editor.state.doc.child(1).textContent).toBe('Typed while uploading');
    expect(editor.state.doc.child(2).attrs.alt).toBe('Mapped result');
    expect(task.snapshot).toMatchObject({ status: 'succeeded', progress: 1 });
    expect(states).toContain('uploading:0.25');
    expect(states.at(-1)).toBe('succeeded:1');
  });

  it('cancels and retries uploads without inserting stale or failed results', async () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const cancelled = startImageUpload(editor, new File(['image'], 'cancel.png', { type: 'image/png' }), {
      upload: (_file, context) => new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
      }),
    });
    cancelled.cancel();
    await expect(cancelled.completion).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled.snapshot.status).toBe('cancelled');
    expect(editor.state.doc.content.every((node) => node.type.name !== 'image_super')).toBe(true);

    let attempt = 0;
    const retried = startImageUpload(editor, new File(['image'], 'retry.png', { type: 'image/png' }), {
      upload: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('Temporary outage');
        return 'https://cdn.example.com/retry.png';
      },
    });
    await expect(retried.completion).rejects.toThrow('Temporary outage');
    expect(retried.snapshot).toMatchObject({ status: 'failed', attempt: 1 });
    await expect(retried.retry()).resolves.toBe(true);
    expect(retried.snapshot).toMatchObject({ status: 'succeeded', attempt: 2 });
    expect(editor.state.doc.content.some((node) => node.attrs.src === 'https://cdn.example.com/retry.png')).toBe(true);
  });

  it('rejects non-images, oversized embeds, and invalid host progress', async () => {
    await expect(imageFileToDataURL(new File(['text'], 'notes.txt', { type: 'text/plain' }))).rejects.toThrow('not an image');
    await expect(imageFileToDataURL(new File([new Uint8Array(5)], 'large.png', { type: 'image/png' }), 4)).rejects.toThrow('4 bytes or smaller');
    const editor = createEditor({ schema: CoreSchemaSpec });
    const invalid = startImageUpload(editor, new File(['image'], 'bad.png', { type: 'image/png' }), {
      upload: async (_file, context) => {
        context.reportProgress(2);
        return 'https://cdn.example.com/unreachable.png';
      },
    });
    await expect(invalid.completion).rejects.toThrow('between 0 and 1');
    expect(invalid.snapshot.status).toBe('failed');
    expect(editor.state.doc.content.some((node) => node.type.name === 'image_super')).toBe(false);
  });

  it('maps a replacement target and refuses to overwrite an image deleted during upload', async () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertImage(editor, { src: 'https://cdn.example.com/old.png', alt: 'Old' })).toBe(true);
    const replacement = deferred<string>();
    const task = startImageUpload(editor, new File(['new'], 'new.png', { type: 'image/png' }), {
      replacePath: [1],
      upload: async () => replacement.promise,
    });
    const before = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Before')]);
    editor.dispatch(editor.state.createTransaction().replace(0, 0, [before]));
    replacement.resolve('https://cdn.example.com/new.png');
    await expect(task.completion).resolves.toBe(true);
    expect(editor.state.doc.child(2).attrs.src).toBe('https://cdn.example.com/new.png');

    const stale = deferred<string>();
    const staleTask = startImageUpload(editor, new File(['stale'], 'stale.png', { type: 'image/png' }), {
      replacePath: [2],
      upload: async () => stale.promise,
    });
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [2])));
    expect(deleteImage(editor)).toBe(true);
    stale.resolve('https://cdn.example.com/stale.png');
    await expect(staleTask.completion).rejects.toThrow('no longer exists');
    expect(editor.state.doc.content.some((node) => node.attrs.src === 'https://cdn.example.com/stale.png')).toBe(false);
  });

  it('provides editable captions, load recovery, and pointer/keyboard resize controls', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          {
            type: 'image_super',
            attrs: {
              src: 'https://cdn.example.com/view.png',
              srcset: 'https://cdn.example.com/view-small.png 480w',
              sizes: '300px',
              alt: 'View',
              caption: 'Initial',
              width: '300px',
            },
          },
          { type: 'paragraph', content: [{ type: 'text', text: '' }] },
        ],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const figure = view.dom.querySelector<HTMLElement>('.fountain-image');
    const input = figure?.querySelector<HTMLTextAreaElement>('[aria-label="Image caption"]');
    const handle = figure?.querySelector<HTMLElement>('[aria-label="Resize image from right"]');
    expect(figure?.getAttribute('role')).toBe('figure');
    expect(input?.value).toBe('Initial');
    if (input) input.value = 'Edited caption';
    input?.dispatchEvent(new FocusEvent('blur'));
    expect(editor.state.doc.child(0).attrs.caption).toBe('Edited caption');
    handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(editor.state.doc.child(0).attrs.width).toBe('310px');
    const image = figure?.querySelector('img');
    image?.dispatchEvent(new Event('error'));
    expect(image?.hasAttribute('srcset')).toBe(false);
    expect(image?.getAttribute('src')).toBe('https://cdn.example.com/view.png');
    expect(figure?.dataset.fountainImageError).toBeUndefined();
    image?.dispatchEvent(new Event('error'));
    expect(figure?.dataset.fountainImageError).toBe('true');
    expect(figure?.querySelector('[role="status"]')?.hasAttribute('hidden')).toBe(false);
    figure?.querySelector<HTMLButtonElement>('button')?.click();
    expect(image?.getAttribute('srcset')).toBe('https://cdn.example.com/view-small.png 480w');
    expect(image?.getAttribute('sizes')).toBe('300px');
    expect(figure?.dataset.fountainImageError).toBeUndefined();
    view.destroy();

    const readonly = createEditor({
      schema: CoreSchemaSpec,
      editable: false,
      content: { type: 'doc', content: [{ type: 'image_super', attrs: { src: 'https://cdn.example.com/read.png', caption: 'Read only' } }] },
    });
    const readonlyMount = document.createElement('div');
    document.body.appendChild(readonlyMount);
    const readonlyView = new EditorView(readonlyMount, readonly);
    expect(readonlyView.dom.querySelector<HTMLTextAreaElement>('[aria-label="Image caption"]')?.hidden).toBe(true);
    expect(readonlyView.dom.querySelector<HTMLElement>('.fountain-image__resize-controls')?.hidden).toBe(true);
    expect(readonlyView.dom.textContent).toContain('Read only');
    readonlyView.destroy();
  });
});
