// Opt-in gap-finding audit, not a release-gate waiver or a visual-fidelity test.
// Downloads only pinned document data; never executes code from the paper.
import { createHash } from 'node:crypto';
import {
  Schema, StarterKit, MathExtension, composeExtensions,
  MarkdownImporter, MarkdownExporter,
} from '../dist/index.js';
import { academicTableSource, academicTableValues } from '../examples/react-app/src/academic-table-sample.ts';
import { mathReferenceSamples } from '../examples/react-app/src/math-reference-samples.ts';

const sourceURL = 'https://raw.githubusercontent.com/tiagoseq/NeuralFieldEq.jl/e68d061e4d91e336b326076cb9ffd61bcbeb41b9/JOSS/paper.md';
const expectedSHA256 = 'ea86c661c312b286331afb8eb8d6bac23c741a6d0df37e6c0045a9672e0c584c';
const response = await fetch(sourceURL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Reference download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== expectedSHA256) {
  throw new Error('Reference source changed; inspect provenance before updating its pinned checksum.');
}
const source = bytes.toString('utf8');
const schema = new Schema(composeExtensions([...StarterKit.extensions, MathExtension]).schema);
const importOptions = { texMathEnvironments: true, texTables: true };
const importIssues = [];
const imported = MarkdownImporter.parseWithSource(source, schema, { ...importOptions, onTeXTableIssue: issue => importIssues.push(issue) });
const counts = {};
const equations = [];
const tables = [];
function visit(node) {
  counts[node.type.name] = (counts[node.type.name] ?? 0) + 1;
  if (node.type.name === 'math_block') equations.push(node.attrs.latex);
  if (node.type.name === 'table') tables.push(node.content.map(row => row.content.map(cell => cell.content.map(paragraph => paragraph.content.map(part => part.attrs.latex ?? part.textContent).join('')).join('\n'))));
  node.content.forEach(visit);
}
visit(imported.document);
const checks = [
  { name: 'unchanged source string', passed: MarkdownExporter.exportWithSource(imported.document, imported.source).markdown === source },
  { name: 'two displayed equations become editable math blocks', expected: 2, actual: counts.math_block ?? 0 },
  { name: 'complete original equation source including labels', passed: JSON.stringify(equations) === JSON.stringify([...source.matchAll(/\\begin\{(equation|align)\}[\s\S]*?\\end\{\1\}/gu)].map(match => match[0])) },
  { name: 'LaTeX tabular becomes an editable table', expected: 1, actual: counts.table ?? 0 },
  { name: 'published table fixture matches pinned source', passed: source.includes(academicTableSource) },
  { name: 'published equation fixtures match pinned source', passed: mathReferenceSamples.slice(1).every(sample => source.includes(sample.source)) },
  { name: 'all 21 original table values including inline math', passed: JSON.stringify(tables) === JSON.stringify([academicTableValues]) },
  { name: 'all three known layout differences explicitly reported', passed: importIssues.length === 3 && importIssues.every(issue => issue.code === 'layout-projection' && issue.source === academicTableSource) },
].map(check => ({ ...check, passed: check.passed ?? check.actual === check.expected }));
console.log(JSON.stringify({
  reference: 'Sequeira (2022), NeuralFieldEq.jl, JOSS 7(75), 3974',
  doi: 'https://doi.org/10.21105/joss.03974',
  license: 'CC-BY-4.0',
  sourceURL,
  sourceSHA256: expectedSHA256,
  importOptions,
  importIssues,
  counts,
  checks,
  status: checks.every(check => check.passed) ? 'structural-preflight-passed' : 'reproduction-incomplete',
  reproductionStatus: 'incomplete: structural projection is not full content/layout/export fidelity',
  notTested: ['visual/pagination fidelity', 'editable equation labels and references', 'bibliography', 'figure assets', 'PDF/DOCX fidelity', 'Lean'],
}, null, 2));
// This status covers the structural preflight only. A pass cannot certify the
// untested reproduction requirements above, and this is not a release gate.
if (checks.some(check => !check.passed)) process.exitCode = 1;
