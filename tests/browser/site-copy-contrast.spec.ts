import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.use({ video: 'on', trace: 'on' });

test('copies homepage output using the native clipboard API', async ({ page, context, browserName }, info) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const panel = page.locator('.studio__export');
  const original = await panel.locator('pre').textContent();
  await panel.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Output copied.');
  await page.evaluate(() => {
    const receiver = document.createElement('textarea');
    receiver.setAttribute('aria-label', 'Independent plain-text receiver');
    document.body.append(receiver);
  });
  const receiver = page.getByRole('textbox', { name: 'Independent plain-text receiver' });
  await receiver.focus(); await receiver.press('ControlOrMeta+v');
  await expect(receiver).toHaveValue(original!);
  await receiver.screenshot({ path: info.outputPath('native-copy-external-receiver.png') });
  expect(errors).toEqual([]);
});

for (const mode of ['denied', 'unavailable'] as const) test(`recovers homepage copy by native manual copying when clipboard access is ${mode}`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(mode => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'unavailable' ? undefined : {
      writeText: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    } });
  }, mode);
  await page.goto('./');
  const panel = page.locator('.studio__export');
  const original = await panel.locator('pre').textContent();
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  const documentText = await editor.textContent();
  expect(original!.length).toBeGreaterThan(100);
  await panel.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('copy it manually');
  const source = panel.getByRole('textbox', { name: 'Exported document source' });
  await expect(source).toHaveValue(original!);
  await expect(source).not.toBeEditable();
  await panel.getByRole('button', { name: 'Select output', exact: true }).click();
  await expect(source).toBeFocused();
  expect(await source.evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd])).toEqual([0, original!.length]);
  await source.press('ControlOrMeta+c');
  await page.evaluate(() => {
    const receiver = document.createElement('textarea');
    receiver.setAttribute('aria-label', 'Independent plain-text receiver');
    document.body.append(receiver);
  });
  const receiver = page.getByRole('textbox', { name: 'Independent plain-text receiver' });
  await receiver.focus();
  await receiver.press('ControlOrMeta+v');
  await expect(receiver).toHaveValue(original!);
  expect(await editor.textContent()).toBe(documentText);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: info.outputPath(`copy-${mode}-manual-fallback.png`) });
  expect(errors).toEqual([]);
});

test('does not report a stale clipboard result for newly selected output', async ({ page }, info) => {
  await page.addInitScript(() => {
    const probe = { writes: [] as string[], finish: () => {} };
    (globalThis as any).copyProbe = probe;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: (text: string) => { probe.writes.push(text); return new Promise<void>(resolve => { probe.finish = resolve; }); },
    } });
  });
  await page.goto('./');
  const panel = page.locator('.studio__export');
  const first = await panel.locator('pre').textContent();
  await panel.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Copying…', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'json', exact: true }).click();
  const second = await panel.locator('pre').textContent();
  expect(second).not.toBe(first);
  await page.evaluate(() => (globalThis as any).copyProbe.finish());
  await expect(panel.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
  await expect(panel.getByRole('status')).not.toContainText('Output copied');
  await panel.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.evaluate(() => (globalThis as any).copyProbe.finish());
  await expect(panel.getByRole('status')).toHaveText('Output copied.');
  expect(await page.evaluate(() => (globalThis as any).copyProbe.writes)).toEqual([first, second]);
  await panel.screenshot({ path: info.outputPath('copy-current-snapshot.png') });
});

test('keeps homepage small labels and export controls above normal-text contrast', async ({ page }, info) => {
  await page.goto('./');
  await expect(page.locator('.outline-tip')).toBeVisible();
  const selectors = ['.capabilities__heading > span', '.flow__title > span', '.architecture > div > span',
    '.section-heading > div > span', '.studio__outline .fountain-navigator__title', '.outline-tip',
    '.format-tabs button', '.export-head button', '.open-source__lead > span'];
  const observations = await page.evaluate(selectors => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const luminance = (color: number[]) => color.slice(0, 3).map(value => {
      const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return selectors.flatMap(selector => {
      const elements = [...document.querySelectorAll<HTMLElement>(selector)];
      if (!elements.length) throw new Error(`Missing contrast target ${selector}`);
      return elements.map(element => {
        const foreground = getComputedStyle(element).color;
        let background = 'rgb(255,255,255)';
        for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
          const value = getComputedStyle(parent).backgroundColor, channels = rgb(value);
          if (channels.length === 3 || channels[3] === 1) { background = value; break; }
          if (channels[3] !== 0) throw new Error(`Translucent contrast target ${selector}`);
        }
        const a = luminance(rgb(foreground)), b = luminance(rgb(background));
        return { selector, text: element.textContent, foreground, background, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
    });
  }, selectors);
  await writeFile(info.outputPath('homepage-contrast.json'), JSON.stringify(observations, null, 2));
  for (const observation of observations) expect(observation.contrast, JSON.stringify(observation)).toBeGreaterThanOrEqual(4.5);
});
