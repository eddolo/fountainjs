import type { Locator, Page } from '@playwright/test';

/** Inspect actual rendered PNG pixels, with the blinking caret hidden. This
 * adds no editor DOM, source text, decorations or application dependencies.
 */
export async function inspectLinePaint(page: Page, paragraph: Locator, path: string) {
  const box = await paragraph.boundingBox();
  if (!box) throw new Error('Expected a visible line box.');
  // Stay inside the line's physical bounds. Rounding outward can include a
  // previous line's descenders at the top of a high-DPI WebKit screenshot.
  const top = Math.ceil(box.y);
  const clip = { x: Math.max(0, box.x - 40), y: top, width: 180, height: Math.max(1, Math.floor(box.y + box.height) - top) };
  const png = await page.screenshot({ path, clip, caret: 'hide' });
  const pixels = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Expected a PNG inspection canvas.');
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0, left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (data[offset] < 120 && data[offset + 1] < 120 && data[offset + 2] < 120 && data[offset + 3] > 200) {
        dark++; left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { dark, left, right, top, bottom, width, height };
  }, png.toString('base64'));
  return { box, clip, pixels };
}
