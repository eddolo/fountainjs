import assert from 'node:assert/strict';
import { parseFragment } from 'parse5';

// This generated domain contains only paragraphs and known inline meanings.
// Adjacent identical emphasis wrappers are semantically equivalent to one
// wrapper; repeated nesting is NOT equivalent and stays in every run's marks.
// This does not modify the independent official-corpus comparator.
function inlineMeaning(html) {
  const blocks = [];
  for (const block of parseFragment(html).childNodes) {
    if (block.nodeName === '#text' && !block.value.trim()) continue;
    assert.equal(block.tagName, 'p', 'Generated probe must remain in its declared paragraph domain.');
    const runs = [];
    const visit = (node, marks = []) => {
      if (node.nodeName === '#text') {
        const text = node.value.replace(/\n/g, ' ');
        const key = JSON.stringify([...marks].sort());
        if (runs.at(-1)?.kind === 'text' && runs.at(-1).key === key) runs.at(-1).text += text;
        else if (text) runs.push({ kind: 'text', key, text });
        return;
      }
      const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]));
      if (node.tagName === 'br') { runs.push({ kind: 'break', marks: [...marks].sort() }); return; }
      if (node.tagName === 'img') {
        runs.push({ kind: 'image', src: attrs.src ?? '', alt: attrs.alt ?? '', title: attrs.title ?? null, marks: [...marks].sort() });
        return;
      }
      assert.ok(['em', 'strong', 'code', 'a'].includes(node.tagName), `Unknown generated inline meaning: ${node.tagName}`);
      const mark = node.tagName === 'a' ? ['link', attrs.href ?? '', attrs.title ?? null] : [node.tagName];
      for (const child of node.childNodes ?? []) visit(child, [...marks, mark]);
    };
    block.childNodes.forEach(node => visit(node));
    blocks.push(runs);
  }
  return blocks;
}

export function checkMarkdownDelimiterNeighbors({ schema, MarkdownImporter, MarkdownExporter,
  HTMLExporter, referenceParser, referenceRenderer }) {
  assert.deepEqual(inlineMeaning('<p><em>a</em><em>b</em></p>'), inlineMeaning('<p><em>ab</em></p>'));
  const control = inlineMeaning('<p>x<em>y</em>z</p>');
  for (const wrong of ['<p>xyz</p>', '<p><em>x</em>yz</p>', '<p>x<strong>y</strong>z</p>', '<p>x<em><em>y</em></em>z</p>']) {
    assert.notDeepEqual(inlineMeaning(wrong), control, 'Reject dropped, moved, changed and repeated formatting.');
  }
  assert.notDeepEqual(inlineMeaning('<p><a href="/one">x</a></p>'), inlineMeaning('<p><a href="/two">x</a></p>'));
  const sources = new Set();
  const add = body => sources.add(`Before ${body} after.\n`);
  const delimiters = ['*', '_', '**', '__', '***', '___', '****', '____'];
  const contexts = ['', ' ', '.', 'a', 'é', '中', '(', ')', '-', '!'];
  for (const open of delimiters) for (const close of delimiters) for (const context of contexts) {
    add(`${open}alpha${context}beta${close}`);
    add(`${context}${open}alpha${close}${context}`);
    add(`${open}alpha [label](/safe "Title") beta${close}`);
    add(`[${open}label${close}](/safe)`);
  }
  for (const outer of delimiters) for (const inner of delimiters) {
    add(`${outer}alpha ${inner}beta${inner} gamma${outer}`);
    add(`${outer}alpha${inner}beta${inner}gamma${outer}`);
    add(`${outer}alpha \`literal * beta\` gamma${outer}`);
  }
  let seed = 0x20261006;
  const next = length => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % length; };
  const chunks = ['alpha', ' beta ', '*', '_', '**', '__', '***', '___', '[', ']', '(/safe)', '\\*', '\\_', '`code`', '.', '!', 'é', '中'];
  for (let sample = 0; sample < 1800; sample++) {
    let value = '';
    for (let i = 0, count = 3 + next(11); i < count; i++) value += chunks[next(chunks.length)];
    add(value);
  }
  assert.equal(sources.size, 3337, 'Review intentional changes to the deterministic neighbor corpus.');
  let checked = 0;
  for (const original of sources) for (const ending of ['\n', '\r\n']) {
    const source = original.replaceAll('\n', ending);
    const expected = inlineMeaning(referenceRenderer.render(referenceParser.parse(source)));
    const parsed = MarkdownImporter.parseWithSource(source, schema, { autolinkLiterals: false });
    const actual = inlineMeaning(HTMLExporter.export(parsed.document, { document: false }));
    assert.deepEqual(actual, expected, `Delimiter neighbor reference meaning: ${JSON.stringify(source)}`);
    assert.equal(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown, source);
    const saved = MarkdownExporter.exportWithReport(parsed.document);
    assert.deepEqual(saved.losses, [], `Unexpected loss: ${JSON.stringify(source)}`);
    const reopened = MarkdownImporter.parse(saved.markdown, schema, { autolinkLiterals: false });
    assert.deepEqual(reopened.toJSON(), parsed.document.toJSON(), `Native canonical retention: ${JSON.stringify(source)}`);
    assert.deepEqual(inlineMeaning(HTMLExporter.export(reopened, { document: false })), expected);
    checked++;
  }
  console.log(`Delimiter neighbors: ${checked} generated LF/CRLF reference-semantic, exact-source and complete native canonical contracts passed; not official-corpus matches.`);
}
