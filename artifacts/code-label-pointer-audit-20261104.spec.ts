import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('label pointer delivery retains the intended code caret', async ({ page }, info) => {
  const events: unknown[] = [];
  page.on('console', message => {
    if (message.text().startsWith('label-pointer:')) events.push(JSON.parse(message.text().slice('label-pointer:'.length)));
  });
  await page.goto('/issue-editor.html');
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  const labels = ['x"y', 'constructor', '__proto__', 'custom-' + 'x'.repeat(70), '<img/src=x/onerror=alert(1)>'];
  const source = '# Code label handoff\n\nTechnical labels are data, not executable markup.\n\n'
    + labels.map((label, index) => `\`\`\`${label}\nexample ${index + 1}\n\`\`\``).join('\n\n');
  await page.getByLabel('Markdown description', { exact: true }).fill(source);
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await page.evaluate(() => {
    const pre = document.querySelector('.fountain-editor pre')!, code = pre.querySelector('code')!;
    const identify = (target: EventTarget | null) => target instanceof Element
      ? `${target.tagName}:${target.getAttribute('data-fountain-path') ?? target.getAttribute('data-fountain-text-path') ?? ''}` : null;
    const record = (event: Event, phase: string) => {
      const native = getSelection();
      console.debug('label-pointer:' + JSON.stringify({ event: event.type, phase, target: identify(event.target),
        prevented: event.defaultPrevented, active: identify(document.activeElement), scrollY,
        anchor: identify(native?.anchorNode?.parentElement ?? null), anchorOffset: native?.anchorOffset,
        focus: identify(native?.focusNode?.parentElement ?? null), focusOffset: native?.focusOffset,
        x: event instanceof MouseEvent ? event.clientX : null, y: event instanceof MouseEvent ? event.clientY : null,
        preTop: pre.getBoundingClientRect().top, codeTop: code.getBoundingClientRect().top }));
    };
    for (const type of ['pointerdown', 'mousedown', 'focusin', 'pointerup', 'mouseup', 'click', 'selectionchange', 'keydown']) {
      document.addEventListener(type, event => {
        record(event, 'capture');
        if (event.type === 'click') queueMicrotask(() => record(event, 'microtask'));
      }, true);
      document.addEventListener(type, event => record(event, 'bubble'));
    }
  });
  try {
    await editor.locator('pre').first().click({ position: { x: 40, y: 24 } });
    await page.keyboard.press('End');
    await page.keyboard.type(' edited');
    await expect(editor.locator('pre').first()).toHaveText('example 1 edited');
  } finally {
    await writeFile(info.outputPath('pointer-events.json'), JSON.stringify({ engine: info.project.name, events,
      heading: await editor.locator('h1').textContent(), code: await editor.locator('pre').first().textContent() }, null, 2));
    await page.screenshot({ path: info.outputPath('pointer-outcome.png') });
  }
});
