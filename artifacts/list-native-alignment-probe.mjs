import { chromium, firefox, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const html = '<ol dir="ltr" start="0"><li dir="rtl"><p>Parent override</p><ol start="0"><li><p>Moved Latin text</p></li><li><p>Trailing nested text</p></li></ol></li></ol>';
const results = {};
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>body{width:700px}p{margin:16px 0}</style>${html}`);
    results[name] = await page.locator('p').filter({ hasText: 'Moved Latin text' }).evaluate(p => {
      const range = document.createRange(); range.selectNodeContents(p);
      const box = p.getBoundingClientRect(), text = range.getBoundingClientRect();
      const chain = [];
      for (let node = p; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        chain.push({ tag: node.tagName, dir: style.direction, align: style.textAlign });
      }
      return { chain, leftGap: text.left - box.left, rightGap: box.right - text.right };
    });
    await page.locator('body').screenshot({ path: `artifacts/list-native-alignment-${name}-20261008.png` });
  } finally { await browser.close(); }
}
await writeFile('artifacts/list-native-alignment-probe-20261008.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
