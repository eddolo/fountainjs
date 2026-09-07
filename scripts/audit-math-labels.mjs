// Independent, development-only semantic oracle. This does not certify Fountain rendering.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { SerializedMmlVisitor } from '@mathjax/src/js/core/MmlTree/SerializedMmlVisitor.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import { mathReferenceSamples } from '../examples/react-app/src/math-reference-samples.ts';

RegisterHTMLHandler(liteAdaptor());
const plainText = node => node.kind === 'text' ? node.getText() : node.childNodes.map(plainText).join('');

function compile(expressions) {
  // Fresh context per snapshot prevents stale labels and counter drift.
  const tex = new TeX({
    packages: ['base', 'ams'], tags: 'ams', maxBuffer: 20_000, maxMacros: 1000,
    formatError(_jax, error) { throw new Error(error.message); },
  });
  const document = mathjax.document('', {
    InputJax: tex,
    compileError(_document, _math, error) { throw error; },
  });
  expressions.forEach(expression => document.math.push(new document.options.MathItem(expression.source, tex, expression.display)));
  // Unlike isolated convert() calls, includes the forward-reference recompile pass.
  document.compile();
  const visitor = new SerializedMmlVisitor();
  return [...document.math].map((math, index) => {
    assert.equal(math.math, expressions[index].source, 'Reference compilation must not mutate submitted source.');
    const tags = [];
    const references = [];
    math.root.walkTree(node => {
      if (node.kind === 'mlabeledtr') tags.push({
        id: node.childNodes[0].attributes.get('id'), text: plainText(node.childNodes[0]),
        row: node.parent.childNodes.indexOf(node),
      });
      if (node.attributes?.get('class') === 'MathJax_ref') references.push({ text: plainText(node), href: node.attributes.get('href') });
      assert.notEqual(node.kind, 'merror', 'An error display is not a successful reference compilation.');
    });
    return { source: math.math, tags, references, mathml: visitor.visitTree(math.root, document) };
  });
}

const equations = mathReferenceSamples.slice(1).map(sample => ({ source: sample.source, display: true }));
assert.deepEqual(equations.map(item => createHash('sha256').update(item.source).digest('hex')), [
  'd43aafd64986470149793169e6c1f001eae2f66706335d4b5e6864ff4fc465b7',
  'b8ae1e0dc1cbaf7c15846891804d22fa0581f45f54e14e4da7857061ab57d3ec',
], 'Published equation fixtures require explicit provenance review before changing.');
const refs = [
  { source: String.raw`\eqref{eq:dNFE}`, display: false },
  { source: String.raw`\eqref{eq:dSNFE}`, display: false },
];
const original = compile([...equations, ...refs]);
assert.deepEqual(original.slice(0, 2).map(item => item.tags), [
  [{ id: 'mjx-eqn:eq:dNFE', text: '(1)', row: 0 }],
  [{ id: 'mjx-eqn:eq:dSNFE', text: '(2)', row: 1 }],
]);
assert.deepEqual(original.slice(2).map(item => item.references[0]?.text), ['(1)', '(2)']);
assert.deepEqual(compile([...equations, ...refs]), original, 'Fresh snapshots must not accumulate numbers or labels.');
const reordered = compile([...refs, ...equations.toReversed()]);
assert.deepEqual(reordered.slice(0, 2).map(item => item.references[0]?.text), ['(2)', '(1)']);
assert.deepEqual(reordered.slice(2).map(item => item.tags[0]?.text), ['(1)', '(2)']);
const deleted = compile([equations[1], ...refs]);
assert.equal(deleted[1].references[0]?.text, '(???)', 'A missing target must remain visibly unresolved.');
assert.equal(deleted[2].references[0]?.text, '(1)');
assert.throws(() => compile([equations[0], equations[0]]), /multiply defined|duplicate/i);
const explicit = compile([
  { source: String.raw`\begin{equation*}a=b\end{equation*}`, display: true },
  { source: String.raw`\begin{equation}\tag{A}\label{manual}c=d\end{equation}`, display: true },
  equations[0], { source: String.raw`\eqref{manual}`, display: false },
]);
assert.equal(explicit[0].tags.length, 0);
assert.equal(explicit[1].tags[0].text, '(A)');
assert.equal(explicit[2].tags[0].text, '(1)');
assert.equal(explicit[3].references[0].text, '(A)');
for (const source of [String.raw`\input{private-file}`, String.raw`\require{html}`, String.raw`\href{https://example.invalid}{x}`, String.raw`\frac{1}`]) {
  assert.throws(() => compile([{ source, display: true }]));
}
console.log(JSON.stringify({
  renderer: `MathJax ${mathjax.version}`, status: 'reference-semantics-verified',
  fountainStatus: 'document-context API and bounded host SVG/reader lab implemented; this script checks semantics only, not whole-paper or export parity',
  equations: original.slice(0, 2).map(item => ({
    sha256: createHash('sha256').update(item.source).digest('hex'), tags: item.tags,
    ...(process.argv.includes('--mathml') ? { mathml: item.mathml } : {}),
  })),
  backwardReferences: original.slice(2).map(item => item.references),
  reorderedForwardReferences: reordered.slice(0, 2).map(item => item.references),
  deletedTarget: deleted[1].references,
  checks: ['unchanged source', 'nonumber defers label to numbered row', 'backward references', 'forward references',
    'reorder renumbering', 'fresh-snapshot repeatability', 'deleted target remains unresolved', 'duplicate labels rejected',
    'starred environments', 'manual tags', 'unsupported commands rejected'],
}, null, 2));
