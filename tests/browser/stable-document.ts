import type { Frame, Page } from '@playwright/test';

/** A reload invalidates an interaction, even if a locator finds a replacement editor. */
export async function inStableDocument<T>(page: Page, label: string, action: () => Promise<T>): Promise<T> {
  const navigations: string[] = [];
  const onNavigated = (frame: Frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  };
  page.on('framenavigated', onNavigated);
  try {
    let result: T;
    try { result = await action(); }
    catch (cause) {
      if (!navigations.length) throw cause;
      throw new Error(`${label}: page navigated during the interaction; editor identity was not stable. Do not rebuild the served application during an audit.`, { cause });
    }
    if (navigations.length) {
      throw new Error(`${label}: page navigated during the interaction; editor identity was not stable. Do not rebuild the served application during an audit.`);
    }
    return result;
  } finally {
    page.off('framenavigated', onNavigated);
  }
}
