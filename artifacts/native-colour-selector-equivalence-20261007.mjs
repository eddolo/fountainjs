import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = readFileSync('src/react/FountainToolbarPrimitives.tsx', 'utf8');
const rootSource = source.slice(source.indexOf('export function FountainToolbarRoot'));
const actualControls = rootSource.match(/querySelectorAll<HTMLElement>\(\s*'([^']+)'/)[1];
const actualFields = rootSource.match(/field\.closest\('([^']+)'/)[1];
const oldControls = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([type="file"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
const oldFields = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"]';
const dom = new JSDOM('<main></main>');
const { document } = dom.window;
const main = document.querySelector('main');
let controls = 0;
for (const tag of ['button','input','select','div','a']) for (const disabled of [false,true])
  for (const tabindex of [null,'-1','0','1']) for (const type of [null,'color','text','hidden','file']) {
    const element = document.createElement(tag);
    if (disabled) element.setAttribute('disabled','');
    if (tabindex !== null) element.setAttribute('tabindex',tabindex);
    if (type !== null) element.setAttribute('type',type);
    main.append(element); controls++;
  }
assert.deepEqual([...main.querySelectorAll(actualControls)], [...main.querySelectorAll(oldControls)]);
let fields = 0;
for (const tag of ['button','input','textarea','select','div','span'])
  for (const editable of [null,'','true','false','TRUE','FALSE','plaintext-only'])
    for (const role of [null,'textbox','combobox','spinbutton','slider','button']) {
      const element = document.createElement(tag);
      if (editable !== null) element.setAttribute('contenteditable', editable);
      if (role !== null) element.setAttribute('role', role);
      main.append(element);
      const descendant = document.createElement('span'); element.append(descendant);
      assert.equal(element.closest(actualFields), element.closest(oldFields));
      assert.equal(descendant.closest(actualFields), descendant.closest(oldFields));
      fields += 2;
    }
console.log(JSON.stringify({ actualSourceSelectors: true, controls, fieldAndDescendantLookups: fields,
  identicalMatches: true, qualification: 'DOM selector equivalence only; not Linux native-focus certification.' }));
dom.window.close();
