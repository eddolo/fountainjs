import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export const tableColumnSideCases = [
    { name: 'ltr', attrs: 'dir="ltr"', first: 'First', direction: 'ltr' },
    { name: 'rtl-cell-ltr', attrs: 'dir="rtl"', first: 'First', direction: 'rtl' },
    { name: 'auto', attrs: 'dir="auto"', first: 'First', direction: 'rtl' },
    { name: 'host-css', attrs: '', first: 'First', direction: 'rtl', host: true },
    { name: 'rtl-spans', attrs: 'dir="rtl"', first: 'Merged Latin', direction: 'rtl', spans: true },
] as const;

/** Physical pointer/keyboard toolbar use; CSS host setup is not a model mutation. */
export async function tableColumnSideJourney(page: Page, info: TestInfo, sample: typeof tableColumnSideCases[number]): Promise<void> {
  const observations: unknown[] = [], errors: string[] = [], navigations: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  try {
    await page.goto('/conversion-lab.html');
      const content = 'spans' in sample
        ? '<tr><td rowspan="2"><p>Row label</p></td><td colspan="2" dir="ltr"><p>Merged Latin</p></td></tr><tr><td><p>Lower one</p></td><td><p>Lower two</p></td></tr>'
        : sample.name === 'auto'
          ? '<tr><td><p>مرحبا</p></td><td dir="ltr"><p>First</p></td></tr><tr><td><p>Lower one</p></td><td><p>Lower two</p></td></tr>'
          : `<tr><td dir="ltr"><p>${sample.first}</p></td><td><p>Second</p></td></tr><tr><td><p>Lower one</p></td><td><p>Lower two</p></td></tr>`;
      const source = `<table ${sample.attrs}>${content}</table><p>After table</p>`;
      await page.getByLabel('Choose documents').setInputFiles({ name: `${sample.name}.html`, mimeType: 'text/html', buffer: Buffer.from(source) });
      const workspace = page.getByRole('region', { name: `Conversion workspace: ${sample.name}.html`, exact: true });
      const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
      const table = editor.locator('table');
      await expect(table).toBeVisible();
      if ('host' in sample) await editor.evaluate(element => { element.style.direction = 'rtl'; });
      await expect(table).toHaveCSS('direction', sample.direction);
      const active = table.locator('td').filter({ has: page.getByText(sample.first, { exact: true }) });
      await expect(active).toHaveCSS('direction', 'ltr');
      const originalCells = await table.locator('td').count();
      for (const side of ['left', 'right'] as const) {
        await active.locator('p').click();
        await workspace.getByRole('button', { name: 'Table options', exact: true }).click();
        const insert = workspace.getByRole('button', { name: `Add column ${side}`, exact: true });
        await expect(insert).toBeEnabled();
        // Cover pointer activation and keyboard Enter independently.
        if (side === 'left') await insert.click();
        else { await insert.focus(); await page.keyboard.press('Enter'); }
        await expect(table.locator('td')).toHaveCount(originalCells + 2);
        await workspace.getByRole('button', { name: 'Close', exact: true }).click();
        await editor.focus();
        await page.keyboard.insertText(`Inserted ${side}`);
        const inserted = table.locator('td').filter({ has: page.getByText(`Inserted ${side}`, { exact: true }) });
        await expect(inserted).toHaveCount(1);
        const a = (await active.boundingBox())!, b = (await inserted.boundingBox())!;
        if (side === 'left') expect(b.x + b.width).toBeLessThanOrEqual(a.x + 1);
        else expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
        await expect(table).toHaveCSS('direction', sample.direction);
        await expect(active).toHaveCSS('direction', 'ltr');
        if ('spans' in sample) { await expect(active).toHaveAttribute('colspan', '2'); await expect(table.locator('td[rowspan="2"]')).toHaveCount(1); }
        observations.push({ name: sample.name, side, source, direction: await table.evaluate(element => getComputedStyle(element).direction),
          cells: await table.locator('tr').first().locator('td').allTextContents(), activeBox: a, insertedBox: b });
        await editor.screenshot({ path: info.outputPath(`table-side-${sample.name}-${side}.png`) });
        // Undo the typing and insertion as distinct actions (or one history group).
        await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
        if (await table.locator('td').count() !== originalCells) await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(table.locator('td')).toHaveCount(originalCells);
        await expect(table).toHaveCSS('direction', sample.direction);
        await expect(active).toHaveCSS('direction', 'ltr');
      }
    expect(errors).toEqual([]);
    expect(navigations).toEqual([new URL('/conversion-lab.html', page.url()).href]);
  } finally {
    const path = info.outputPath('table-side-observations.json');
    await writeFile(path, JSON.stringify({ observations, errors, navigations }, null, 2));
    await info.attach('table-side-observations', { path, contentType: 'application/json' });
  }
}
