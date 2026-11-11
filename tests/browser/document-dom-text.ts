import type { Locator } from '@playwright/test';

/** Read rendered document content while excluding only explicit view widgets. */
export function readDocumentDOMText(locator: Locator): Promise<string> {
  return locator.evaluateAll(elements => elements.map(element => {
    const content = element.cloneNode(true) as Element;
    content.querySelectorAll('[data-fountain-widget]').forEach(widget => widget.remove());
    return content.textContent ?? '';
  }).join(''));
}
