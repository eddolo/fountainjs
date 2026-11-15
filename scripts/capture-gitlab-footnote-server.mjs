import { readFile, writeFile } from 'node:fs/promises';
import { parseFragment } from 'parse5';
import assert from 'node:assert/strict';

function inspect(html) {
  const root = parseFragment(html), nodes = [];
  const walk = node => { nodes.push(node); (node.childNodes ?? []).forEach(walk); };
  walk(root);
  const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
  const ids = new Map();
  for (const node of nodes) {
    const id = attr(node, 'id');
    if (id !== undefined) ids.set(id, [...(ids.get(id) ?? []), node]);
  }
  const refs = nodes.filter(node => node.tagName === 'a' && node.parentNode?.tagName === 'sup' && attr(node, 'data-footnote-ref') !== undefined);
  const backlinks = nodes.filter(node => node.tagName === 'a' && attr(node, 'data-footnote-backref') !== undefined);
  for (const reference of refs) {
    const target = (attr(reference, 'href') ?? '').replace(/^#/u, '');
    assert.equal(ids.get(target)?.length, 1, 'A reference must have one definition destination.');
    const definition = ids.get(target)[0];
    assert.equal(definition.tagName, 'li'); assert.equal(definition.parentNode?.tagName, 'ol');
    assert.notEqual(attr(definition.parentNode?.parentNode, 'data-footnotes'), undefined);
    assert.equal(ids.get(attr(reference, 'id'))?.length, 1, 'Every occurrence needs its own ID.');
  }
  for (const backlink of backlinks) {
    const target = (attr(backlink, 'href') ?? '').replace(/^#/u, '');
    assert.equal(ids.get(target)?.length, 1, 'A backlink must have one reference destination.');
    const reference = ids.get(target)[0];
    assert.ok(refs.includes(reference));
    let owner = backlink.parentNode;
    while (owner && !(owner.tagName === 'li' && owner.parentNode?.tagName === 'ol'
      && attr(owner.parentNode?.parentNode, 'data-footnotes') !== undefined)) owner = owner.parentNode;
    assert.ok(owner); assert.equal(attr(reference, 'href'), '#' + attr(owner, 'id'));
  }
  const text = node => node.tagName === 'a' && attr(node, 'data-footnote-backref') !== undefined ? ''
    : node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
  return { references: refs.length, backlinks: backlinks.length, text: text(root) };
}

export async function captureGitLabFootnoteServer({ root, pin, version, renderMarkdown, overlay }) {
  assert.ok(overlay?.sha256, 'This profile must run against the declared read-only server repair.');
  const stock = JSON.parse(await readFile(new URL('integrations/gitlab/fixtures/footnote-probe-live-html.json', root)));
  const editing = JSON.parse(await readFile(new URL('integrations/gitlab/fixtures/footnote-editing-live-html.json', root)));
  const names = ['simple', 'repeated', 'ordered', 'hyphen', 'underscore', 'case', 'unicode', 'unicode-space',
    'punctuation', 'multiblock', 'nested-reference', 'nested-definition', 'links-math', 'definition-reference', 'table',
    'backslash-label', 'unicode-case', 'unreferenced', 'two-unused', 'unused-multiblock', 'unused-math-link', 'authored-backlink'];
  const inputs = [...stock.fixtures, ...editing.fixtures].filter(item => names.includes(item.name))
    .flatMap(item => [{ name: item.name, source: item.source, stockBody: item.body },
      ...(item.probe ? [{ name: item.name + '-probe', source: item.probe.source, stockBody: item.probeBody }] : [])]);
  inputs.push({ name: 'occurrence-label-collision', source: 'First[^a], other[^a-2], repeated[^a].\n\n[^a]: First body.\n\n[^a-2]: Other body.' });
  const fixtures = [];
  for (const item of inputs) {
    const result = await renderMarkdown(item.source);
    assert.equal(typeof result.body, 'string');
    const observed = inspect(result.body);
    if (item.stockBody !== undefined) {
      // The old responses intentionally contain broken links; compare visible
      // content separately rather than running the repaired-link oracle on them.
      const tree = parseFragment(item.stockBody);
      const text = node => node.tagName === 'a' && node.attrs?.some(attr => attr.name === 'data-footnote-backref') ? ''
        : node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
      assert.equal(observed.text, text(tree), 'The server repair must preserve visible document and definition text.');
    }
    fixtures.push({ name: item.name, source: item.source, body: result.body,
      references: observed.references, backlinks: observed.backlinks, stockTextPreserved: item.stockBody !== undefined });
  }
  const report = { status: 'passed', scope: 'Actual Rails rendering and exact local forward/backlink ownership; not the complete label grammar or every application surface',
    upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision }, overlay,
    fixtures };
  await writeFile(new URL('integrations/gitlab/fixtures/footnote-server-live-html.json', root), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', rendered: fixtures.length, sourceTextPreserved: fixtures.filter(item => item.stockTextPreserved).length }));
}
