import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
test('native repeated invalid focus baseline', async ({page}, info) => {
  const results = [];
  for (const kind of ['input', 'custom', 'custom-microtask']) {
    await page.setContent('<form><button>Submit</button></form>');
    await page.evaluate(kind => {
      const form = document.querySelector('form')!;
      let field: HTMLElement;
      if (kind === 'input') {
        const input = document.createElement('input'); input.required = true; field = input;
      } else {
        customElements.define(`native-repeat-probe-${kind}`, class extends HTMLElement {
          static formAssociated = true;
          constructor() {
            super(); const internals = this.attachInternals();
            this.addEventListener('connected-probe', () => internals.setValidity({valueMissing:true}, 'Please enter content.', this.firstElementChild as HTMLElement));
          }
        });
        field = document.createElement(`native-repeat-probe-${kind}`); field.tabIndex = -1;
        const anchor = document.createElement('span'); anchor.tabIndex = -1;
        anchor.style.cssText = 'position:absolute;display:block;width:1px;height:1px;pointer-events:none';
        const editor = document.createElement('div'); editor.contentEditable = 'true'; editor.tabIndex = 0;
        editor.style.cssText = 'min-height:150px;border:1px solid'; editor.innerHTML = '<p><br></p>';
        const focus = () => kind === 'custom-microtask' ? queueMicrotask(() => editor.focus()) : editor.focus();
        anchor.addEventListener('focus', focus); field.addEventListener('focus', focus);
        field.append(anchor, editor);
      }
      field.id = 'control'; form.prepend(field); field.dispatchEvent(new Event('connected-probe'));
      (window as any).focusEvents = [];
      document.addEventListener('focusin', e => (window as any).focusEvents.push((e.target as Element).tagName));
    }, kind);
    for (const display of ['inline', 'block', 'inline-block']) {
      await page.locator('#control').evaluate((node, display) => { (node as HTMLElement).style.display = display; }, display);
      await page.getByRole('button', {name:'Submit'}).click();
      results.push(await page.evaluate(({kind, display}) => ({kind, display, active:document.activeElement?.tagName, events:(window as any).focusEvents.slice()}),{kind,display}));
      await page.keyboard.press('Escape');
    }
  }
  await writeFile(info.outputPath('focus-baseline.json'), JSON.stringify(results,null,2));
});
