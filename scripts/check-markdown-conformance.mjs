import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import commonmarkSpec from 'commonmark-spec';
import { parseFragment } from 'parse5';

import {
  CoreSchemaSpec,
  HTMLExporter,
  MarkdownImporter,
  Schema,
} from '../dist/index.js';

const BASELINE_PATH = fileURLToPath(new URL(
  '../tests/fixtures/markdown/commonmark-semantic-baseline-v1.json',
  import.meta.url,
));
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const reportOnly = process.argv.includes('--report');
const showMismatches = process.argv.includes('--show-mismatches');

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main',
  'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
]);

function attribute(node, name) {
  return node.attrs?.find((candidate) => candidate.name === name)?.value ?? '';
}

function textContent(node) {
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes ?? []).map(textContent).join('');
}

function normalizedText(value) {
  return value.replace(/[\t\n\r ]+/g, ' ');
}

function normalizeInline(tokens) {
  const merged = [];
  for (const token of tokens.flat()) {
    if (!token) continue;
    if (token[0] === 'text' && merged.at(-1)?.[0] === 'text') {
      merged[merged.length - 1][1] += token[1];
    } else merged.push(token);
  }
  if (merged[0]?.[0] === 'text') merged[0][1] = merged[0][1].replace(/^ +/, '');
  if (merged.at(-1)?.[0] === 'text') merged.at(-1)[1] = merged.at(-1)[1].replace(/ +$/, '');
  return merged.filter((token) => token[0] !== 'text' || token[1]);
}

function inline(node) {
  if (node.nodeName === '#text') return [['text', normalizedText(node.value)]];
  if (node.nodeName === '#comment') return [['html-comment', node.data]];
  const tag = node.tagName;
  const children = () => normalizeInline((node.childNodes ?? []).flatMap(inline));
  if (tag === 'em' || tag === 'i') return [['emphasis', children()]];
  if (tag === 'strong' || tag === 'b') return [['strong', children()]];
  if (tag === 'del' || tag === 's') return [['strike', children()]];
  if (tag === 'code') return [['code', textContent(node)]];
  if (tag === 'br') return [['hard-break']];
  if (tag === 'a') return [[
    'link',
    attribute(node, 'href'),
    attribute(node, 'title') || null,
    children(),
  ]];
  if (tag === 'img') return [[
    'image',
    attribute(node, 'src'),
    attribute(node, 'title') || null,
    attribute(node, 'alt'),
  ]];
  return [[
    'html-inline',
    tag ?? node.nodeName,
    [...(node.attrs ?? [])].map(({ name, value }) => [name, value]).sort(),
    children(),
  ]];
}

function codeLanguage(node) {
  const code = node.childNodes?.find((child) => child.tagName === 'code');
  const language = attribute(code ?? node, 'class').match(/(?:^|\s)language-([^\s]+)/)?.[1]
    ?? attribute(node, 'data-language');
  return !language || language === 'text' ? null : language;
}

function listItem(node) {
  return ['item', blockChildren(node.childNodes ?? [])];
}

function block(node) {
  const tag = node.tagName;
  if (tag === 'p') return ['paragraph', normalizeInline((node.childNodes ?? []).flatMap(inline))];
  if (/^h[1-6]$/.test(tag)) {
    return ['heading', Number(tag[1]), normalizeInline((node.childNodes ?? []).flatMap(inline))];
  }
  if (tag === 'blockquote') return ['blockquote', blockChildren(node.childNodes ?? [])];
  if (tag === 'ul' || tag === 'ol') {
    const items = (node.childNodes ?? []).filter((child) => child.tagName === 'li').map(listItem);
    return ['list', tag === 'ol' ? 'ordered' : 'bullet', tag === 'ol' ? Number(attribute(node, 'start') || 1) : null, items];
  }
  if (tag === 'pre') {
    return ['code-block', codeLanguage(node), textContent(node).replace(/\n$/, '')];
  }
  if (tag === 'hr') return ['thematic-break'];
  return [
    'html-block',
    tag ?? node.nodeName,
    [...(node.attrs ?? [])].map(({ name, value }) => [name, value]).sort(),
    blockChildren(node.childNodes ?? []),
  ];
}

function blockChildren(nodes) {
  const result = [];
  let pending = [];
  const flush = () => {
    const content = normalizeInline(pending.flatMap(inline));
    if (content.length) result.push(['paragraph', content]);
    pending = [];
  };
  for (const node of nodes) {
    const isBlock = node.tagName && BLOCK_TAGS.has(node.tagName);
    if (isBlock) {
      flush();
      result.push(block(node));
    } else if (node.nodeName === '#text' && !node.value.trim() && !pending.length) {
      // Formatting whitespace between block elements has no document meaning.
    } else pending.push(node);
  }
  flush();
  return result;
}

function semanticProjection(html) {
  return blockChildren(parseFragment(html).childNodes);
}

function expandRanges(source) {
  const result = new Set();
  for (const part of source.split(',').map((value) => value.trim()).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid CommonMark example range: ${part}`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (end < start) throw new Error(`Descending CommonMark example range: ${part}`);
    for (let value = start; value <= end; value += 1) result.add(value);
  }
  return result;
}

function compressRanges(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const result = [];
  let start = sorted[0];
  let end = start;
  for (const value of sorted.slice(1)) {
    if (value === end + 1) end = value;
    else {
      result.push(start === end ? `${start}` : `${start}-${end}`);
      start = value;
      end = value;
    }
  }
  if (start !== undefined) result.push(start === end ? `${start}` : `${start}-${end}`);
  return result.join(',');
}

if (baseline.version !== 1 || baseline.standard !== 'CommonMark 0.31.2' || baseline.projectionVersion !== 1) {
  throw new Error('The Markdown semantic baseline does not match this oracle implementation.');
}
if (!Array.isArray(baseline.intentionalDivergences)
  || baseline.intentionalDivergences.some(({ exampleRanges, reason }) => !exampleRanges || !reason)) {
  throw new Error('Every intentional CommonMark divergence needs example ranges and a reason.');
}
if (!Array.isArray(commonmarkSpec.tests) || commonmarkSpec.tests.length !== 652) {
  throw new Error(`Expected 652 CommonMark 0.31.2 examples, found ${commonmarkSpec.tests?.length ?? 'none'}.`);
}

const schema = new Schema(CoreSchemaSpec);
const matches = new Set();
const mismatches = [];
for (const example of commonmarkSpec.tests) {
  const expected = semanticProjection(example.html);
  let actual;
  let error = null;
  try {
    const document = MarkdownImporter.parse(example.markdown, schema);
    actual = semanticProjection(HTMLExporter.export(document, { document: false }));
  } catch (cause) {
    error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }
  if (!error && JSON.stringify(actual) === JSON.stringify(expected)) matches.add(example.number);
  else mismatches.push({ ...example, expected, actual, error });
}

const required = expandRanges(baseline.requiredMatchRanges);
const pending = expandRanges(baseline.pendingMismatchRanges);
const intentional = new Set(baseline.intentionalDivergences.flatMap(({ exampleRanges }) => (
  [...expandRanges(exampleRanges)]
)));
const classifications = [required, pending, intentional];
for (let number = 1; number <= commonmarkSpec.tests.length; number += 1) {
  const count = classifications.filter((examples) => examples.has(number)).length;
  if (count !== 1) {
    throw new Error(`CommonMark example ${number} has ${count} baseline classifications; expected exactly one.`);
  }
}
const regressed = [...required].filter((number) => !matches.has(number));
const newlyMatching = [...pending].filter((number) => matches.has(number));
const changedDivergences = [...intentional].filter((number) => matches.has(number));
const mismatchSections = new Map();
for (const mismatch of mismatches) {
  const examples = mismatchSections.get(mismatch.section) ?? [];
  examples.push(mismatch.number);
  mismatchSections.set(mismatch.section, examples);
}

console.log(`CommonMark ${baseline.standard.replace('CommonMark ', '')}: ${matches.size}/${commonmarkSpec.tests.length} examples match Fountain's neutral semantic projection.`);
if (reportOnly) console.log(`Matched example ranges: ${compressRanges(matches)}`);
if (newlyMatching.length) console.log(`New matches to review: ${compressRanges(newlyMatching)}`);
console.log(`Baseline classifications: ${required.size} matching, ${pending.size} pending, ${intentional.size} intentional divergences.`);
if (reportOnly) {
  console.log('Remaining mismatches by section:');
  for (const [section, examples] of [...mismatchSections].sort((left, right) => left[0].localeCompare(right[0]))) {
    console.log(`- ${section}: ${examples.length}${showMismatches ? ` (${compressRanges(examples)})` : ''}`);
  }
}

if (reportOnly) process.exit(0);
if (!required.size) throw new Error('The CommonMark semantic baseline contains no required matches.');
if (newlyMatching.length) {
  throw new Error(`Promote newly matching CommonMark examples into requiredMatchRanges: ${compressRanges(newlyMatching)}`);
}
if (changedDivergences.length) {
  throw new Error(`Review intentional CommonMark divergences that now match: ${compressRanges(changedDivergences)}`);
}
if (regressed.length) {
  const details = regressed.slice(0, 10).map((number) => {
    const mismatch = mismatches.find((candidate) => candidate.number === number);
    return `example ${number} (${mismatch?.section ?? 'unknown'}): ${mismatch?.error ?? 'semantic projection changed'}`;
  });
  throw new Error(`CommonMark semantic regressions:\n${details.join('\n')}${regressed.length > 10 ? `\n…and ${regressed.length - 10} more` : ''}`);
}
