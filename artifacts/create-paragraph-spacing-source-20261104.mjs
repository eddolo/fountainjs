import { mkdirSync, writeFileSync } from 'node:fs';
const root = 'artifacts/paragraph-spacing-source-20261104';
mkdirSync(root);
const base = { unit: 'pt', fontFamily: 'Arial', fontSize: 11, lineHeight: 14, lineHeightUnit: 'pt', lineHeightRule: 'exact' };
const layout = (spacingGroup, spacingBefore, spacingAfter, contextualSpacing) => ({ ...base, spacingGroup, spacingBefore, spacingAfter, contextualSpacing });
const first = layout('body', 0, 10, true), second = layout('body', 12, 0, false);
const attribute = value => JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const p = (text, value) => `<p data-fountain-paragraph-layout="${attribute(value)}">${text}</p>`;
const steps = layout('steps', 12, 10, true);
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Field study review</title></head><body>
<h1 data-fountain-paragraph-layout="${attribute({ ...layout('title', 0, 18, false), fontSize: 20, lineHeight: 24 })}">Field study review</h1>
${p('Review draft. Preserve the authored spacing settings.', layout('intro', 0, 8, false))}
${p('First research observation.', first)}
${p('Second research observation.', second)}
${p('Third observation starts another category.', layout('other', 12, 0, false))}
<ol><li>${p('Step one: record the measurement.', steps)}</li><li>${p('Step two: confirm the reading.', steps)}</li></ol>
${p('Following note stays in the same step group.', layout('steps', 12, 0, false))}
<table><tbody><tr><td>${p('Control sample', layout('body', 12, 10, true))}</td><td>${p('Independent sample', second)}</td></tr></tbody></table>
<pre data-language="python" data-fountain-paragraph-layout="${attribute(layout('code', 12, 0, false))}"><code>temperature = 21</code></pre>
${p('Conclusion awaiting approval.', layout('body', 12, 0, false))}
</body></html>`;
writeFileSync(`${root}/spacing-review.html`, html);
writeFileSync(`${root}/provenance.json`, JSON.stringify({
  purpose: 'Independent literal HTML input for a recorded editing/reader journey; no Fountain serializer creates this source.',
  first, second, expectedInitialGapPt: 2, expectedSameStyleListGapPt: 0, expectedFollowingListGapPt: 2,
  expectedGapAfterRemovingFirstObservationPt: 12,
  nativeWordBehaviorVerified: false,
}, null, 2) + '\n');
console.log('Created a literal field-review source with paragraph/list/table/code flows and retained spacing declarations.');
