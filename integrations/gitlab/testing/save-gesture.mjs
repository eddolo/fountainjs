/** Use real keyboard and pointer events, and capture the visible text at click. */
export async function recordGitLabSave({page,editor,button,key,pace}) {
  // Position the pointer while the author is still editing. Locator actionability
  // checks after the key can consume the entire immediate-click interval in WebKit.
  await button.hover();
  const point = await button.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!button.contains(document.elementFromPoint(x,y))) throw new Error('Save button is obscured');
    return {x,y};
  });
  if (!await editor.evaluate(el => el.contains(document.activeElement))) throw new Error('Editor lost focus before the final key');
  // Observe trusted input and the pre-submit DOM without delaying the click.
  await editor.evaluate(el => {
    const receipt = {};
    window.__quickSaveReceipt = receipt;
    el.addEventListener('keydown', event => {
      receipt.key = event.key;
      receipt.trustedKey = event.isTrusted;
      receipt.keyAt = event.timeStamp;
    }, {capture: true, once: true});
    el.closest('[data-testid="work-item-description-wrapper"]').addEventListener('click', event => {
      receipt.button = event.target.closest('button')?.textContent.trim();
      receipt.trustedClick = event.isTrusted;
      receipt.clickAt = event.timeStamp;
      receipt.paragraphs = [...el.querySelectorAll('p')].map(p => p.textContent);
    }, {capture: true, once: true});
  });
  await page.keyboard.press(key);
  // The half-second pause is an intentional control for the immediate click.
  if (pace === 'reviewed') await page.waitForTimeout(500);
  await page.mouse.click(point.x,point.y);
  return page.evaluate(() => window.__quickSaveReceipt);
}

export function matchesSaveGesture(gesture,key,expected,pace) {
  if (gesture?.trustedKey !== true || gesture.trustedClick !== true || gesture.key !== key ||
      gesture.button !== 'Save changes' || gesture.paragraphs?.length !== 1 || gesture.paragraphs[0] !== expected ||
      !Number.isFinite(gesture.keyAt) || !Number.isFinite(gesture.clickAt)) return false;
  const elapsed = gesture.clickAt - gesture.keyAt;
  return pace === 'immediate' ? elapsed >= 0 && elapsed < 100 : pace === 'reviewed' && elapsed >= 500;
}
