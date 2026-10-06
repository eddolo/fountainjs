/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Schema, StarterKit } from 'fountainjs-editor';
import { exportDOCX } from 'fountainjs-editor/docx';
import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';

// Isolate the real headless import UI from unrelated editor workshops. The
// document schema, DOCX adapter and OutputPanel are not mocked.
vi.mock('../examples/react-app/src/HTMLContainerWorkshop', () => ({ HTMLContainerWorkshop: () => null }));
vi.mock('../examples/react-app/src/HTMLCommentWorkshop', () => ({ HTMLCommentWorkshop: () => null }));
vi.mock('../examples/react-app/src/HTMLFlowWorkshop', () => ({ HTMLFlowWorkshop: () => null }));
import DemoPage from '../examples/react-app/src/DemoPage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const schema = new Schema(StarterKit.schema);
function deferredFile(name: string, text: string) {
  const document = schema.node('doc', {}, [schema.node('paragraph', { align: 'left' }, [schema.text(text)])]);
  const bytes = exportDOCX(document).bytes.slice().buffer as ArrayBuffer;
  let resolve!: (bytes: ArrayBuffer) => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise<ArrayBuffer>((yes, no) => { resolve = yes; reject = no; });
  const file = new File([], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  Object.defineProperty(file, 'arrayBuffer', { value: () => pending });
  return { file, complete: () => resolve(bytes), fail: () => reject(new Error('older read failed')), expected: withDOCXExportDefaults(document.toJSON()) };
}

describe('headless DOCX file ownership and readiness', () => {
  let mount: HTMLDivElement;
  let root: Root;
  let previousDemo: string | undefined;
  const button = (name: string) => [...mount.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === name)!;
  const output = () => mount.querySelector('.demo-output pre')!.textContent;
  const status = () => [...mount.querySelectorAll('.headless-status')].map(value => value.textContent).join('\n');
  const upload = async (file: File) => {
    const input = mount.querySelector<HTMLInputElement>('input[aria-label="Import Word DOCX"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  };
  beforeEach(async () => {
    previousDemo = document.body.dataset.demo;
    document.body.dataset.demo = 'node-markdown';
    mount = document.createElement('div'); document.body.append(mount); root = createRoot(mount);
    await act(async () => root.render(<DemoPage />));
    await act(async () => button('Word DOCX').click());
  });
  afterEach(async () => {
    await act(async () => root.unmount()); mount.remove();
    if (previousDemo === undefined) delete document.body.dataset.demo;
    else document.body.dataset.demo = previousDemo;
  });
  it('does not announce an undefined document as valid', () => {
    expect(status()).toContain('Choose a .docx file');
    expect(status()).not.toContain('Valid document');
    expect(button('Download as Word DOCX').disabled).toBe(true);
  });
  it('announces a pending file and exposes only its completed document', async () => {
    const request = deferredFile('pending.docx', 'Pending document');
    await upload(request.file);
    expect(status()).toContain('Reading pending.docx');
    expect(output()).toBe('');
    expect(button('Download as Word DOCX').disabled).toBe(true);
    await act(async () => request.complete());
    expect(JSON.parse(output()!)).toEqual(request.expected);
    expect(status()).toContain('Valid document');
  });
  it('prevents slower older completion from replacing a newer document', async () => {
    const older = deferredFile('older.docx', 'Older content');
    const newer = deferredFile('newer.docx', 'Newer content');
    await upload(older.file); await upload(newer.file);
    await act(async () => newer.complete());
    expect(JSON.parse(output()!)).toEqual(newer.expected);
    await act(async () => older.complete());
    expect(JSON.parse(output()!)).toEqual(newer.expected);
    expect(mount.querySelector('.headless-docx-controls')!.textContent).toContain('newer.docx');
  });
  it('ignores an older failed read after a newer successful import', async () => {
    const older = deferredFile('older.docx', 'Older content');
    const newer = deferredFile('newer.docx', 'Newer content');
    await upload(older.file); await upload(newer.file);
    await act(async () => newer.complete());
    await act(async () => older.fail());
    expect(status()).not.toContain('older read failed');
    expect(JSON.parse(output()!)).toEqual(newer.expected);
  });
  it('does not export the previous file while its replacement is loading', async () => {
    const first = deferredFile('first.docx', 'First content');
    await upload(first.file); await act(async () => first.complete());
    expect(button('Download as Word DOCX').disabled).toBe(false);
    const replacement = deferredFile('replacement.docx', 'Replacement content');
    await upload(replacement.file);
    expect(button('Download as Word DOCX').disabled).toBe(true);
    expect(output()).toBe('');
    await act(async () => replacement.complete());
    expect(JSON.parse(output()!)).toEqual(replacement.expected);
  });
  it('announces the current read failure and permits a fresh successful import', async () => {
    const failed = deferredFile('failed.docx', 'Unavailable');
    await upload(failed.file); await act(async () => failed.fail());
    expect(mount.querySelector('[data-import-state="error"]')!.getAttribute('role')).toBe('alert');
    expect(output()).toBe('');
    expect(button('Download as Word DOCX').disabled).toBe(true);
    const retry = deferredFile('failed.docx', 'Retried content');
    await upload(retry.file);
    expect(mount.querySelector('[data-import-state="loading"]')!.getAttribute('aria-busy')).toBe('true');
    await act(async () => retry.complete());
    expect(JSON.parse(output()!)).toEqual(retry.expected);
    expect(mount.querySelector('[data-import-state="ready"]')!.getAttribute('aria-busy')).toBe('false');
  });
  it('keeps the announced output mode through asynchronous document replacement', async () => {
    await act(async () => button('html').click());
    expect(button('html').getAttribute('aria-pressed')).toBe('true');
    expect(button('json').getAttribute('aria-pressed')).toBe('false');
    const request = deferredFile('mode.docx', 'Retained mode');
    await upload(request.file); await act(async () => request.complete());
    expect(button('html').getAttribute('aria-pressed')).toBe('true');
    const html = new DOMParser().parseFromString(output()!, 'text/html');
    expect(html.body.textContent).toBe('Retained mode');
    expect(html.querySelectorAll('p')).toHaveLength(1);
    expect(JSON.parse(html.querySelector('p')!.getAttribute('data-fountain-paragraph-layout')!))
      .toEqual(request.expected.content![0]!.attrs!.layout);
    await act(async () => button('json').click());
    expect(JSON.parse(output()!)).toEqual(request.expected);
  });
  it('invalidates a pending read when its owning schema changes', async () => {
    const request = deferredFile('old-schema.docx', 'Old schema content');
    await upload(request.file);
    await act(async () => button('Markdown').click());
    const containers = mount.querySelectorAll<HTMLInputElement>('.headless-html-policy input[type="checkbox"]')[0]!;
    await act(async () => containers.click());
    await act(async () => request.complete());
    await act(async () => button('Word DOCX').click());
    expect(status()).toContain('Document schema changed');
    expect(output()).toBe('');
  });
  it('names import and export announcements separately without changing the imported document', async () => {
    const request = deferredFile('status.docx', 'Status document');
    await upload(request.file); await act(async () => request.complete());
    // Only the file-download boundary is replaced; schema/conversion/output
    // remain real. Native downloads are covered by recorded browser journeys.
    const OriginalURL = URL;
    vi.stubGlobal('URL', class extends OriginalURL {
      static createObjectURL() { return 'blob:headless-status-test'; }
      static revokeObjectURL() {}
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await act(async () => button('Download as Word DOCX').click());
      expect(mount.querySelectorAll('.headless-status[role="status"]')).toHaveLength(2);
      const imported = mount.querySelectorAll('[role="status"][aria-label="Document import status"]');
      const exported = mount.querySelectorAll('[role="status"][aria-label="DOCX export status"]');
      expect(imported).toHaveLength(1); expect(exported).toHaveLength(1);
      expect(imported[0].textContent).toContain('Valid document · 1 top-level blocks');
      expect(exported[0].textContent).toContain('Downloaded');
      expect(JSON.parse(output()!)).toEqual(request.expected);
    } finally { click.mockRestore(); vi.unstubAllGlobals(); }
  });
});
