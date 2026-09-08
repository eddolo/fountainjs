import { expect, it } from 'vitest';
import type { Frame, Page } from '@playwright/test';
import { inStableDocument } from './browser/stable-document';

it.each(['success', 'failure', 'navigation', 'navigation-and-failure'])('removes the audit listener after %s', async mode => {
  const listeners = new Set<(frame: Frame) => void>();
  const mainFrame = { url: () => 'http://localhost/editor' } as Frame;
  const childFrame = { url: () => 'http://localhost/embed' } as Frame;
  const page = {
    mainFrame: () => mainFrame,
    on: (_event: string, listener: (frame: Frame) => void) => { listeners.add(listener); },
    off: (_event: string, listener: (frame: Frame) => void) => { listeners.delete(listener); },
  } as unknown as Page;
  const failure = new Error('Editor rejected a real action');
  const pending = inStableDocument(page, 'Test action', async () => {
    expect(listeners.size).toBe(1);
    listeners.forEach(listener => listener(childFrame));
    if (mode.includes('navigation')) listeners.forEach(listener => listener(mainFrame));
    if (mode.includes('failure')) throw failure;
    return 'complete';
  });
  if (mode.includes('navigation')) {
    const error = await pending.catch(error => error);
    expect(error.message).toMatch(/page navigated during the interaction/);
    if (mode.includes('failure')) expect(error.cause).toBe(failure);
  } else if (mode === 'failure') await expect(pending).rejects.toBe(failure);
  else await expect(pending).resolves.toBe('complete');
  expect(listeners.size).toBe(0);
});
