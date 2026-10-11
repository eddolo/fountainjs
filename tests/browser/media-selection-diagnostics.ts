import type { ConsoleMessage, Page, TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

/** Passive native-event evidence: never set editor state, focus, or selection. */
export async function recordMediaSelection(page: Page, info: TestInfo): Promise<() => Promise<void>> {
  const events: unknown[] = [];
  const prefix = 'fountain-media-selection-audit:';
  const receive = (message: ConsoleMessage) => {
    if (message.type() !== 'debug' || !message.text().startsWith(prefix) || events.length >= 80) return;
    try { events.push(JSON.parse(message.text().slice(prefix.length))); } catch { /* Ignore unrelated diagnostics. */ }
  };
  page.on('console', receive);
  await page.evaluate(prefix => {
    const controller = new AbortController();
    const audit = window as typeof window & { fountainMediaAudit?: AbortController };
    audit.fountainMediaAudit = controller;
    const point = (node: Node | null, offset: number) => {
      const element = node instanceof Element ? node : node?.parentElement;
      return { tag: element?.tagName ?? null, path: element?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null,
        nodePath: element?.closest('[data-fountain-path]')?.getAttribute('data-fountain-path') ?? null, offset };
    };
    const capture = (event: string) => {
      const active = document.activeElement;
      const range = document.getSelection();
      console.debug(prefix + JSON.stringify({ event, time: performance.now(),
        active: { tag: active?.tagName ?? null, className: active instanceof HTMLElement ? active.className : null },
        native: range ? { collapsed: range.isCollapsed, anchor: point(range.anchorNode, range.anchorOffset),
          focus: point(range.focusNode, range.focusOffset) } : null,
        selectedMediaPath: document.querySelector('[data-fountain-media-selected]')?.getAttribute('data-fountain-path') ?? null,
        selectedNodePath: document.querySelector('[data-fountain-selected-node]')?.getAttribute('data-fountain-path') ?? null,
        attributesPresent: Boolean(document.querySelector('[aria-label="Selected media attributes"]')),
      }));
    };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'selectionchange', 'focusin', 'focusout']) {
      document.addEventListener(type, () => { capture(type); queueMicrotask(() => capture(`${type}:after`)); },
        { capture: true, passive: true, signal: controller.signal });
    }
    capture('installed');
  }, prefix);
  return async () => {
    try {
      const finalState = await page.evaluate(() => {
        const audit = window as typeof window & { fountainMediaAudit?: AbortController };
        audit.fountainMediaAudit?.abort(); delete audit.fountainMediaAudit;
        return { event: 'teardown', time: performance.now(),
          selectedMediaPath: document.querySelector('[data-fountain-media-selected]')?.getAttribute('data-fountain-path') ?? null,
          selectedNodePath: document.querySelector('[data-fountain-selected-node]')?.getAttribute('data-fountain-path') ?? null,
          attributesPresent: Boolean(document.querySelector('[aria-label="Selected media attributes"]')) };
      });
      events.push(finalState);
    } catch { /* Teardown after a test timeout may already have closed the page. */ }
    finally {
      page.off('console', receive);
      await writeFile(info.outputPath('media-selection-events.json'), JSON.stringify({
        scope: 'first attachment selection only; native events and DOM markers; no editor/selection/focus API writes',
        maximumNativeEvents: 80, maximumEvents: 81, events,
      }, null, 2));
    }
  };
}
