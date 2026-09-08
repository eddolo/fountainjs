import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import commonmarkSpec from 'commonmark-spec';
import { Parser as CommonMarkParser, HtmlRenderer as CommonMarkRenderer } from 'commonmark';
import { parseFragment } from 'parse5';

import {
  CoreSchemaSpec,
  HTMLExporter,
  MarkdownImporter,
  MarkdownExporter,
  Schema,
} from '../dist/index.js';
import { ServerHTMLImporter } from '../dist/html-server.js';

const BASELINE_PATH = fileURLToPath(new URL(
  '../tests/fixtures/markdown/commonmark-semantic-baseline-v1.json',
  import.meta.url,
));
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const runtimeMaps = readdirSync('dist').filter(file => /\.(?:js|cjs)\.map$/u.test(file));
if (!runtimeMaps.length) throw new Error('Runtime source maps are required to verify the test-oracle boundary.');
for (const file of runtimeMaps) {
  const map = JSON.parse(readFileSync(`dist/${file}`, 'utf8'));
  if (map.sources.some(source => /(?:^|\/)commonmark\/(?:lib|dist)\//u.test(source.replaceAll('\\', '/')))) {
    throw new Error(`The development-only CommonMark oracle entered runtime output: ${file}`);
  }
}
const reportOnly = process.argv.includes('--report');
const showMismatches = process.argv.includes('--show-mismatches');
const htmlPolicyReport = process.argv.includes('--html-policy-report');
const htmlFlowReport = process.argv.includes('--html-flow-report');
const inspectedExamples = new Set(process.argv
  .filter((value) => value.startsWith('--example='))
  .map((value) => Number(value.slice('--example='.length))));

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main',
  'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
  'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
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

function normalizedURL(value) {
  try { return encodeURI(decodeURI(value)); } catch { return value; }
}

function normalizeInline(tokens) {
  const merged = [];
  for (const sourceToken of tokens) {
    if (!sourceToken) continue;
    const token = [...sourceToken];
    if (token[0] === 'text' && merged.at(-1)?.[0] === 'hard-break') {
      token[1] = token[1].replace(/^ +/, '');
    }
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
    normalizedURL(attribute(node, 'href')),
    attribute(node, 'title') || null,
    children(),
  ]];
  if (tag === 'img') return [[
    'image',
    normalizedURL(attribute(node, 'src')),
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

function listItem(node, reference) {
  return ['item', blockChildren(node.childNodes ?? [], reference)];
}

function block(node, reference) {
  const tag = node.tagName;
  if (tag === 'p') return ['paragraph', normalizeInline((node.childNodes ?? []).flatMap(inline))];
  if (/^h[1-6]$/.test(tag)) {
    return ['heading', Number(tag[1]), normalizeInline((node.childNodes ?? []).flatMap(inline))];
  }
  if (tag === 'blockquote') return ['blockquote', blockChildren(node.childNodes ?? [], reference)];
  if (tag === 'ul' || tag === 'ol') {
    const items = (node.childNodes ?? []).filter((child) => child.tagName === 'li').map((item) => listItem(item, reference));
    return ['list', tag === 'ol' ? 'ordered' : 'bullet', tag === 'ol' ? Number(attribute(node, 'start') || 1) : null, items];
  }
  if (tag === 'pre') {
    // Only a reference Markdown code block has the canonical final terminator.
    // Authored raw <pre> content owns every LF. Bind this distinction to the
    // actual renderer's output offset, never tag spelling, order or attributes.
    const generated = reference.has(node.sourceCodeLocation?.startOffset);
    return ['code-block', codeLanguage(node), generated ? textContent(node).replace(/\n$/, '') : textContent(node)];
  }
  if (tag === 'hr') return ['thematic-break'];
  if (tag === 'td' || tag === 'th') {
    // An explicit unit span is the same HTML table geometry as its omission.
    // Preserve every other attribute, header/data distinction and content block.
    const attrs = (node.attrs ?? []).filter(({ name, value }) => !(
      (name === 'colspan' || name === 'rowspan') && value === '1'
    )).map(({ name, value }) => [name, value]).sort();
    return ['table-cell', tag, attrs, blockChildren(node.childNodes ?? [], reference)];
  }
  if (tag === 'figure' && attribute(node, 'data-align')) {
    const meaningful = (node.childNodes ?? []).filter((child) => (
      child.tagName || child.nodeName !== '#text' || child.value.trim()
    ));
    if (meaningful.length === 1 && meaningful[0].tagName === 'img') {
      // Fountain intentionally promotes a standalone Markdown image into its
      // richer block-image node. Ignore only the default figure layout shell
      // so the oracle compares the shared image meaning, not either AST.
      return ['paragraph', inline(meaningful[0])];
    }
  }
  return [
    'html-block',
    tag ?? node.nodeName,
    [...(node.attrs ?? [])].map(({ name, value }) => [name, value]).sort(),
    blockChildren(node.childNodes ?? [], reference),
  ];
}

function blockChildren(nodes, reference) {
  const result = [];
  let pending = [];
  const flush = () => {
    const content = normalizeInline(pending.flatMap(inline));
    if (content.length) result.push(['paragraph', content]);
    pending = [];
  };
  for (const node of nodes) {
    const scoped = paragraphFormattingScope(node, reference);
    const isBlock = node.tagName && BLOCK_TAGS.has(node.tagName);
    if (scoped) {
      flush();
      result.push(...scoped);
    } else if (isBlock) {
      flush();
      result.push(block(node, reference));
    } else if (node.nodeName === '#text' && !node.value.trim() && !pending.length) {
      // Formatting whitespace between block elements has no document meaning.
    } else pending.push(node);
  }
  flush();
  return result;
}

// HTML permits an inline formatting scope around paragraph blocks. Fountain
// stores that formatting on each paragraph's inline content instead. Normalize
// only attribute-free mark scopes containing paragraphs/headings (or another
// such scope), not arbitrary wrappers, mixed loose text, code or layout nodes.
// Keep paragraph boundaries and apply the mark even to an empty paragraph.
function paragraphFormattingScope(node, reference) {
  const marks = { strong: 'strong', b: 'strong', em: 'emphasis', i: 'emphasis', del: 'strike', s: 'strike' };
  const mark = Object.hasOwn(marks, node.tagName) ? marks[node.tagName] : null;
  if (!mark || node.attrs?.length) return null;
  const blocks = [];
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text' && !child.value.trim()) continue;
    if (child.tagName === 'p' || /^h[1-6]$/u.test(child.tagName)) blocks.push(block(child, reference));
    else {
      const nested = paragraphFormattingScope(child, reference);
      if (!nested) return null;
      blocks.push(...nested);
    }
  }
  if (!blocks.length) return null;
  return blocks.map(value => [...value.slice(0, -1), [[mark, value.at(-1)]]]);
}

function semanticProjection(html, reference = new Set()) {
  return blockChildren(parseFragment(html, { sourceCodeLocationInfo: true }).childNodes, reference);
}

// Observe the oracle's renderer without changing one byte of its HTML. A raw
// HTML block can contain identical <pre><code> markup, so neither a regex nor
// occurrence counting can reliably identify Markdown-generated code blocks.
function referenceOutput(renderer, document) {
  const codeOffsets = new Set();
  const tag = renderer.tag;
  const codeBlock = renderer.code_block;
  const ownTag = Object.hasOwn(renderer, 'tag');
  const ownCodeBlock = Object.hasOwn(renderer, 'code_block');
  let inCodeBlock = false;
  renderer.code_block = function (...args) {
    inCodeBlock = true;
    try { return codeBlock.apply(this, args); } finally { inCodeBlock = false; }
  };
  renderer.tag = function (name, ...args) {
    if (inCodeBlock && name === 'pre') codeOffsets.add(this.buffer.length);
    return tag.call(this, name, ...args);
  };
  try {
    const html = renderer.render(document);
    for (const offset of codeOffsets) {
      if (!/^<pre[ >]/u.test(html.slice(offset))) throw new Error('Reference code-block origin was not a pre start tag.');
    }
    return { html, projection: semanticProjection(html, codeOffsets) };
  } finally {
    if (ownTag) renderer.tag = tag; else delete renderer.tag;
    if (ownCodeBlock) renderer.code_block = codeBlock; else delete renderer.code_block;
  }
}

// Independent reference semantics with ONLY the raw-HTML rendering policy
// changed. Never compare either parser's AST or rewrite Markdown source.
const referenceParser = new CommonMarkParser();
const referenceRenderer = new CommonMarkRenderer();
const inertRenderer = new CommonMarkRenderer();
inertRenderer.html_inline = function (node) {
  this.out(node.literal.replace(/\n/gu, ' '));
};
inertRenderer.html_block = function (node) {
  this.cr();
  this.lit('<p>');
  const lines = node.literal.replace(/\n$/u, '').split('\n');
  lines.forEach((line, index) => {
    if (index) this.lit('<br>\n');
    this.out(line);
  });
  this.lit('</p>');
  this.cr();
};

function referenceHTMLTokens(reference) {
  const tokens = [];
  const walker = reference.walker();
  for (let event; (event = walker.next());) {
    if (!event.entering) continue;
    if (event.node.type === 'html_inline') tokens.push(['inline', event.node.literal]);
    if (event.node.type === 'html_block') tokens.push(['block', event.node.literal.replace(/\n$/u, '')]);
  }
  return tokens;
}

function fountainHTMLTokens(source, schema) {
  const tokens = [];
  const document = MarkdownImporter.parse(source, schema, {
    parseHTMLBlock: html => { tokens.push(['block', html]); return null; },
    parseHTMLInline: segments => {
      segments.forEach(segment => { if (segment.kind === 'html') tokens.push(['inline', segment.html]); });
      return null;
    },
  });
  return { document, tokens };
}

function retainsLiteralHTML(document, tokens) {
  const readable = node => node.isText ? node.text
    : node.type.name === 'hard_break' ? '\n' : node.content.map(readable).join('');
  const content = readable(document);
  let cursor = 0;
  for (const [kind, raw] of tokens) {
    const literal = kind === 'inline' ? raw.replace(/\n/gu, ' ') : raw;
    const found = content.indexOf(literal, cursor);
    if (found < 0) return false;
    cursor = found + literal.length;
  }
  return true;
}

function generatedHTMLPolicyCases() {
  const cases = [];
  const blocks = [
    '<script>\n*literal* &amp;\n</script>', '<!--\n*literal* &amp;\n-->',
    '<?pi\n*literal* &amp;\n?>', '<!DOCTYPE\n*literal* &amp;\n>',
    '<![CDATA[\n*literal* &amp;\n]]>', '<div>\n*literal* &amp;\n</div>',
    '<custom-box>\n*literal* &amp;\n</custom-box>',
  ];
  const containers = [
    source => source,
    source => source.split('\n').map(line => `> ${line}`).join('\n'),
    source => `- Item\n\n${source.split('\n').map(line => `  ${line}`).join('\n')}`,
    source => `- Item\n\n${source.split('\n').map(line => `  > ${line}`).join('\n')}`,
  ];
  blocks.forEach((block, kind) => containers.forEach((wrap, container) => {
    for (const indentation of ['', '   ']) for (const ending of ['\n', '\r\n']) {
      const html = block.split('\n').map(line => indentation + line).join('\n');
      const source = wrap(`Before *marked*.\n\n${html}\n\nAfter **strong**.`).replaceAll('\n', ending);
      cases.push({ name: `block-${kind + 1}/container-${container}/indent-${indentation.length}/${JSON.stringify(ending)}`, source });
    }
  }));
  for (const value of ['*not emphasis*', '&amp; \\*', 'line\nnext', 'quoted > <&']) {
    const opening = `<em data-value="${value}">`;
    for (const body of [
      `Before ${opening}one **two**</em> after.`,
      `Before *${opening}one* two</em> after.`,
      `[link ${opening}label</em>](/safe) after.`,
      `Before ${opening.replace('data-value=', 'data-value==')}*visible*</em> after.`,
    ]) for (const ending of ['\n', '\r\n']) cases.push({ name: `inline-${cases.length}`, source: body.replaceAll('\n', ending) });
  }
  return cases;
}

// A separate, explicitly classified contract, NEVER part of the semantic
// matching projection. Add exactly one caret paragraph only to an empty root,
// quote, or list item. Preserve every existing block, inline token, and attr.
function withEditableCaretHosts(blocks) {
  if (!blocks.length) return [['paragraph', []]];
  return blocks.map(block => {
    if (block[0] === 'blockquote') return ['blockquote', withEditableCaretHosts(block[1])];
    if (block[0] === 'list') {
      return [...block.slice(0, 3), block[3].map(item => ['item', withEditableCaretHosts(item[1])])];
    }
    return block;
  });
}

// CommonMark's spec source uses a visible arrow as notation for a tab in both
// halves of an example. The reference runners materialize it before parsing.
function materializeTabs(value) {
  return value.replaceAll('→', '\t');
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

if (baseline.version !== 1 || baseline.standard !== 'CommonMark 0.31.2' || baseline.projectionVersion !== 9) {
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
// Compare actual text characters, without the general visible-whitespace
// projection: a decoded LF entity is not a physical Markdown soft break.
let entityNewlineContracts = 0;
for (const entity of ['&#10;', '&#xA;', '&NewLine;', '&#13;', '&#xD;', '&#13;&#10;']) {
  for (const wrapper of ['', '**']) {
    const source = `${wrapper}a${entity}b\nc${wrapper}`;
    const walker = referenceParser.parse(source).walker();
    let expected = '';
    for (let event; (event = walker.next());) {
      if (!event.entering) continue;
      if (event.node.type === 'text') expected += event.node.literal;
      else if (event.node.type === 'softbreak') expected += ' ';
    }
    const actual = MarkdownImporter.parse(source, schema);
    if (actual.textContent !== expected) throw new Error(`Entity/soft-break character mismatch: ${JSON.stringify(source)}`);
    const reopened = MarkdownImporter.parse(MarkdownExporter.export(actual), schema);
    if (JSON.stringify(reopened.toJSON()) !== JSON.stringify(actual.toJSON())) {
      throw new Error(`Entity/soft-break round-trip mismatch: ${JSON.stringify(source)}`);
    }
    entityNewlineContracts += 1;
  }
}
console.log(`Entity newlines: ${entityNewlineContracts} reference text-character and canonical round-trip contracts passed.`);
// Independent newline contracts, including two identical oracle HTML strings
// whose source provenance requires different normalized code payloads.
const codeOriginCases = [
  ['<pre><code>x</code></pre>\n', [['code-block', null, 'x']]],
  ['<pre><code>x\n</code></pre>\n', [['code-block', null, 'x\n']]],
  ['<pre><code>x\n\n</code></pre>\n', [['code-block', null, 'x\n\n']]],
  ['```\nx\n```\n', [['code-block', null, 'x']]],
  ['```\nx\n\n```\n', [['code-block', null, 'x\n']]],
  ['    x\n', [['code-block', null, 'x']]],
  ['<pre><code>x\n</code></pre>\n\n```\nx\n```\n\n<pre><code>x\n</code></pre>', [
    ['code-block', null, 'x\n'], ['code-block', null, 'x'], ['code-block', null, 'x\n'],
  ]],
  ['> <pre><code>x\n> </code></pre>\n>\n> ```\n> x\n> ```', [
    ['blockquote', [['code-block', null, 'x\n'], ['code-block', null, 'x']]],
  ]],
  ['- <pre><code>x\n  </code></pre>\n\n  ```\n  x\n  ```', [
    ['list', 'bullet', null, [['item', [['code-block', null, 'x\n'], ['code-block', null, 'x']]]]],
  ]],
  ['<pre data-reference-code="true"><code class="language-js">x\n</code></pre>\n\n```js\nx\n```', [
    ['code-block', 'js', 'x\n'], ['code-block', 'js', 'x'],
  ]],
];
for (const [source, expected] of codeOriginCases) {
  for (const ending of ['\n', '\r\n']) {
    const input = source.replaceAll('\n', ending);
    const reference = referenceParser.parse(input);
    const observed = referenceOutput(referenceRenderer, reference);
    if (observed.html !== referenceRenderer.render(reference)
      || JSON.stringify(observed.projection) !== JSON.stringify(expected)) {
      throw new Error(`Reference code origin contract failed: ${JSON.stringify(input)}`);
    }
    const captured = MarkdownImporter.parseWithSource(input, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseFlow, parseHTMLInline: ServerHTMLImporter.parseInline,
    });
    if (JSON.stringify(semanticProjection(HTMLExporter.export(captured.document, { document: false }))) !== JSON.stringify(expected)
      || MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== input) {
      throw new Error(`Rich import lost code whitespace: ${JSON.stringify(input)}`);
    }
  }
}
const rawTwin = referenceOutput(referenceRenderer, referenceParser.parse('<pre><code>x\n</code></pre>\n'));
const fencedTwin = referenceOutput(referenceRenderer, referenceParser.parse('```\nx\n```\n'));
if (rawTwin.html !== fencedTwin.html || JSON.stringify(rawTwin.projection) === JSON.stringify(fencedTwin.projection)) {
  throw new Error('Code origin comparator must distinguish identical HTML with different source provenance.');
}
for (const source of ['<pre><code>x\n</code></pre>', '<pre><code>x\n\n</code></pre>', '```\nx\n\n```']) {
  const expected = referenceOutput(referenceRenderer, referenceParser.parse(source)).projection;
  for (const damaged of [expected[0][2].slice(0, -1), expected[0][2] + '\n']) {
    const html = HTMLExporter.export(schema.node('doc', {}, [schema.node('code_block', {}, [schema.text(damaged)])]), { document: false });
    if (JSON.stringify(semanticProjection(html)) === JSON.stringify(expected)) throw new Error('Code comparator accepted a lost or added LF.');
  }
}
console.log(`Code origins: ${codeOriginCases.length * 2} LF/CRLF import/source contracts; identical-HTML provenance distinguished; 6 newline corruptions rejected.`);
const plainTable = '<table><tr><td>A</td><td>B</td></tr></table>';
const explicitTable = '<table><tbody><tr><td colspan="1" rowspan="1"><p>A</p></td><td rowspan="1" colspan="1"><p>B</p></td></tr></tbody></table>';
if (JSON.stringify(semanticProjection(plainTable)) !== JSON.stringify(semanticProjection(explicitTable))) {
  throw new Error('Equivalent unit table spans and cell paragraph wrappers must compare equally.');
}
const tableSensitivityCases = [
  [plainTable, plainTable.replace('<td>A', '<th>A').replace('A</td>', 'A</th>')],
  [plainTable, plainTable.replace('<td>A</td>', '')],
  [plainTable, plainTable.replace('<td>A</td><td>B</td>', '<td>B</td><td>A</td>')],
  [plainTable, plainTable.replace('</table>', '<tr><td>C</td><td>D</td></tr></table>')],
  [plainTable, plainTable.replace('<td>A', '<td colspan="2">A')],
  [plainTable, plainTable.replace('<td>A', '<td rowspan="2">A')],
  [plainTable, plainTable.replace('<td>A', '<td data-owner="Ada">A')],
  [plainTable, plainTable.replace('A</td>', '<p>A</p><p></p></td>')],
  [plainTable.replace('<td>A', '<td><strong>A').replace('A</td>', 'A</strong></td>'), plainTable],
  [plainTable.replace('<tr>', '<thead><tr>').replace('</tr>', '</tr></thead>'), plainTable],
  [plainTable.replace('<tr>', '<caption>Report</caption><tr>'), plainTable],
  [plainTable.replace('A</td>', 'A<br>B</td>'), plainTable.replace('A</td>', 'A B</td>')],
  [plainTable.replace('A</td>', '<p>A</p><p>B</p></td>'), plainTable.replace('A</td>', 'A B</td>')],
  [plainTable.replace('A</td>', `${plainTable}</td>`), plainTable],
];
for (const [expected, damaged] of tableSensitivityCases) {
  if (JSON.stringify(semanticProjection(expected)) === JSON.stringify(semanticProjection(damaged))) {
    throw new Error(`Table comparator accepted structural or content loss: ${damaged}`);
  }
}
console.log(`Table projection: unit spans/cell wrappers equivalent; ${tableSensitivityCases.length} structural/content corruptions rejected.`);
const formattingScopeCases = [
  ...['strong', 'b', 'em', 'i', 'del', 's'].map(tag => [
    `<${tag}>\n\nFirst\n\nSecond\n\n</${tag}>\n`,
    `<p><${tag}>First</${tag}></p><p><${tag}>Second</${tag}></p>`,
  ]),
  ['<del>\n\n*foo*\n\n</del>\n', '<p><s><em>foo</em></s></p>'],
  ['<strong>\n<em><p>Both</p></em>\n</strong>\n', '<p><strong><em>Both</em></strong></p>'],
  ['<strong>\n\n# Heading\n\nBody\n\n</strong>\n', '<h1><strong>Heading</strong></h1><p><strong>Body</strong></p>'],
  ['<del>\n<p>First</p><p>Second</p></del>\n\nPlain\n', '<p><s>First</s></p><p><s>Second</s></p><p>Plain</p>'],
];
for (const [source, equivalent] of formattingScopeCases) {
  for (const ending of ['\n', '\r\n']) {
    const input = source.replaceAll('\n', ending);
    const expected = referenceOutput(referenceRenderer, referenceParser.parse(input)).projection;
    const imported = MarkdownImporter.parseWithSource(input, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseFlow, parseHTMLInline: ServerHTMLImporter.parseInline,
    });
    if (JSON.stringify(expected) !== JSON.stringify(semanticProjection(equivalent))
      || JSON.stringify(expected) !== JSON.stringify(semanticProjection(HTMLExporter.export(imported.document, { document: false })))
      || MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== input) {
      throw new Error(`Formatting-scope semantic/source contract failed: ${JSON.stringify(input)}`);
    }
  }
}
const scopedParagraphs = '<del><p>First</p><p>Second</p></del><p>Plain</p>';
const formattingScopeCorruptions = [
  '<p><s>First Second</s></p><p>Plain</p>',
  '<p><s>First</s></p><p>Second</p><p>Plain</p>',
  '<p><s>First</s></p><p><s>Second</s></p><p><s>Plain</s></p>',
  '<p><s>Second</s></p><p><s>First</s></p><p>Plain</p>',
  '<p><s>First</s></p><p><s>Second</s></p><p></p><p>Plain</p>',
  '<h2><s>First</s></h2><p><s>Second</s></p><p>Plain</p>',
  '<del data-author="Ada"><p>First</p><p>Second</p></del><p>Plain</p>',
  '<x><p><s>First</s></p><p><s>Second</s></p></x><p>Plain</p>',
  '<constructor><p><s>First</s></p><p><s>Second</s></p></constructor><p>Plain</p>',
  '<pre><s>First\nSecond</s></pre><p>Plain</p>',
];
for (const damaged of formattingScopeCorruptions) {
  if (JSON.stringify(semanticProjection(scopedParagraphs)) === JSON.stringify(semanticProjection(damaged))) {
    throw new Error(`Formatting-scope comparator accepted content/structure/identity loss: ${damaged}`);
  }
}
console.log(`Formatting scopes: ${formattingScopeCases.length * 2} reference semantic/source contracts; ${formattingScopeCorruptions.length} corruptions rejected.`);
// Inline HTML containing block elements is a different parser boundary. Do not
// hide its existing, explicit fallback behind the block-scope equivalence above.
for (const source of ['<strong><em><p>Both</p></em></strong>\n', '<del><p>First</p><p>Second</p></del>\n']) {
  const fallbacks = [];
  const imported = MarkdownImporter.parseWithSource(source, schema, {
    parseHTMLFlow: ServerHTMLImporter.parseFlow, parseHTMLInline: ServerHTMLImporter.parseInline,
    onHTMLInlineFallback: issue => fallbacks.push(issue),
  });
  if (!fallbacks.length || imported.document.textContent !== source.trimEnd()
    || MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== source
    || JSON.stringify(referenceOutput(referenceRenderer, referenceParser.parse(source)).projection)
      === JSON.stringify(semanticProjection(HTMLExporter.export(imported.document, { document: false })))) {
    throw new Error('Inline block HTML must remain an explicit, source-preserving nonconformance, not a false scope match.');
  }
}
console.log('Inline block HTML: 2 existing literal fallbacks retained, explicitly not counted as conformance.');
// The separate block-returning paragraph adapter is opt-in and does not alter
// either existing baseline. Reference rendering includes HTML's paragraph
// recovery, including the trailing empty paragraph generated by a closing </p>.
const paragraphRecoveryCases = [
  'Before <p>Inside **bold**</p> After',
  'Before <h2>Heading</h2> After',
  'Before <blockquote>Quoted *text*</blockquote> After',
  '> Before <p>Inside</p> After',
  '- Before <p>Inside</p> After',
  '- Before <p>Inside</p> After\n- Next <h2>Heading</h2> End',
  '- Before <p>Inside</p> After\n\n- Next <h2>Heading</h2> End',
  '- Before <p>Inside</p> After\n\n  Another <p>Block</p> End',
  '- Before <p>Inside</p> After\n  - nested\n\n  - loose child\n- Next',
  '- Before <p>Inside</p> After\n  > nested\n  >\n  > quote\n- Next',
  '- Before <p>Inside</p> After\n  ```\n  code\n\n  still code\n  ```\n- Next',
  '- Before <p>Inside</p> After\n  - nested\n\n  Another <p>Block</p> End',
  '-     code\n\n  Before <p>Inside</p> After',
  '1. Before <p>Inside</p> After\n2. Next',
  '> - Before <p>Inside</p> After\n> - Next',
  '- > Before <p>Inside</p> After',
  '- [x]: /url\n\n  Before <p>Inside</p> After',
  '- Before <p>Inside</p> After\n\n  [x]: /url\n  Another <p>Block</p> End',
  '- Outer <p>Inside</p> End\n  - Nested <h2>Heading</h2> End\n\n  - Other <p>Block</p> End\n- Next',
];
for (const source of paragraphRecoveryCases) {
  for (const ending of ['\n', '\r\n']) {
    const input = `${source.replaceAll('\n', ending)}${ending}`;
    const expected = referenceOutput(referenceRenderer, referenceParser.parse(input)).projection;
    const captured = MarkdownImporter.parseWithSource(input, schema, { parseHTMLParagraph: ServerHTMLImporter.parseParagraph, parseHTMLFlow: ServerHTMLImporter.parseFlow });
    const actual = semanticProjection(HTMLExporter.export(captured.document, { document: false }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)
      || MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== input) {
      throw new Error(`Paragraph recovery differs from reference semantics/source: ${JSON.stringify(input)}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
    }
  }
}
console.log(`Paragraph recovery: ${paragraphRecoveryCases.length * 2} opt-in reference/source contracts; existing baselines unchanged.`);
// Empty-item placeholder blocks and omitted HTML comment identity remain
// mismatches. Do not normalize either away to inflate conformance.
for (const source of ['- [x]:\n    /url\n- Before <p>Inside</p> After', '-\n\n- Before <p>Inside</p> After', '- Before <p>Inside</p> After\n  <!-- comment\n\n  still comment -->\n- Next']) {
  const actual = MarkdownImporter.parse(source, schema, { parseHTMLParagraph: ServerHTMLImporter.parseParagraph, parseHTMLFlow: ServerHTMLImporter.parseFlow });
  if (JSON.stringify(semanticProjection(HTMLExporter.export(actual, { document: false }))) === JSON.stringify(referenceOutput(referenceRenderer, referenceParser.parse(source)).projection)) {
    throw new Error('Review the newly matching empty-item/comment representation before changing its pending classification.');
  }
}
let paragraphSourceChecks = 0;
for (const example of commonmarkSpec.tests) {
  for (const ending of ['\n', '\r\n']) {
    const source = materializeTabs(example.markdown).replaceAll('\n', ending);
    const captured = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
      parseHTMLFlow: ServerHTMLImporter.parseFlow, parseHTMLInline: ServerHTMLImporter.parseInline,
    });
    if (MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== source) {
      throw new Error(`Paragraph-adapter source retention failed for example ${example.number}.`);
    }
    paragraphSourceChecks++;
  }
}
console.log(`Paragraph recovery: ${paragraphSourceChecks} corpus source-retention checks; not full semantic conformance.`);
const matches = new Set();
const mismatches = [];
const roundTripFailures = [];
const referenceFailures = [];
const htmlPolicyFailures = [];
const htmlTokenFailures = [];
const htmlPolicyGroup = baseline.pendingWorkGroups.find(group => group.inertContract === 'literal-html-reference-v1');
if (!htmlPolicyGroup) throw new Error('Missing the explicit literal-html-reference-v1 policy contract.');
const htmlPolicyExamples = expandRanges(htmlPolicyGroup.exampleRanges);
for (const example of commonmarkSpec.tests) {
  const source = materializeTabs(example.markdown);
  const reference = referenceParser.parse(source);
  const rendered = referenceOutput(referenceRenderer, reference);
  if (rendered.html !== materializeTabs(example.html)) referenceFailures.push(example.number);
  const expected = rendered.projection;
  let actual;
  let error = null;
  try {
    const document = MarkdownImporter.parse(source, schema);
    if (htmlPolicyExamples.has(example.number)) {
      const restored = MarkdownImporter.parse(MarkdownExporter.export(document), schema);
      const captured = MarkdownImporter.parseWithSource(source, schema);
      if (!document.eq(restored) || !captured.document.eq(document)
        || MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== source) roundTripFailures.push(example.number);
    }
    actual = semanticProjection(HTMLExporter.export(document, { document: false }));
    if (htmlPolicyExamples.has(example.number)) {
      const expectedTokens = referenceHTMLTokens(reference);
      const probed = fountainHTMLTokens(source, schema);
      if (!document.eq(probed.document) || JSON.stringify(probed.tokens) !== JSON.stringify(expectedTokens)
        || !retainsLiteralHTML(document, expectedTokens)) htmlTokenFailures.push({
        number: example.number, source, expected: expectedTokens, actual: probed.tokens, literalRetained: retainsLiteralHTML(document, expectedTokens),
      });
      const expectedInert = referenceOutput(inertRenderer, reference).projection;
      if (JSON.stringify(actual) !== JSON.stringify(expectedInert)) htmlPolicyFailures.push({
        number: example.number, source, expected: expectedInert, actual,
      });
    }
  } catch (cause) {
    if (htmlPolicyExamples.has(example.number)) roundTripFailures.push(example.number);
    error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }
  if (!error && JSON.stringify(actual) === JSON.stringify(expected)) matches.add(example.number);
  else mismatches.push({ ...example, source, expected, actual, error });
}

if (referenceFailures.length) throw new Error(`The reference parser did not reproduce the pinned official HTML fixtures: ${compressRanges(referenceFailures)}`);
const generatedCases = generatedHTMLPolicyCases();
const generatedFailures = [];
for (const test of generatedCases) {
  try {
    const reference = referenceParser.parse(test.source);
    const expected = referenceOutput(inertRenderer, reference).projection;
    const captured = MarkdownImporter.parseWithSource(test.source, schema);
    const actual = semanticProjection(HTMLExporter.export(captured.document, { document: false }));
    const probe = fountainHTMLTokens(test.source, schema);
    if (JSON.stringify(actual) !== JSON.stringify(expected)
      || JSON.stringify(probe.tokens) !== JSON.stringify(referenceHTMLTokens(reference))
      || !retainsLiteralHTML(captured.document, referenceHTMLTokens(reference))
      || !probe.document.eq(captured.document)
      || MarkdownExporter.exportWithSource(captured.document, captured.source).markdown !== test.source
      || !MarkdownImporter.parse(MarkdownExporter.export(captured.document), schema).eq(captured.document)) {
      generatedFailures.push({ ...test, expected, actual, expectedTokens: referenceHTMLTokens(reference), actualTokens: probe.tokens });
    }
  } catch (error) { generatedFailures.push({ ...test, error: String(error) }); }
}
// Prove the neutral comparator is not erasing precisely the losses it guards.
// These are deliberately incorrect rendered outcomes, not baseline fixtures.
const sensitivityCases = [
  ['A <em>text</em>.', '<p>A &lt;em&gt;text.</p>'],
  ['A <x a="one">text</x>.', '<p>A &lt;x a="two"&gt;text&lt;/x&gt;.</p>'],
  ['A <em>text</em>.', '<p>A <em>text</em>.</p>'],
  ['A <x>*text*</x>.', '<p>A &lt;x&gt;<strong>text</strong>&lt;/x&gt;.</p>'],
  ['<div>\none\ntwo\n</div>', '<p>&lt;div&gt; one two &lt;/div&gt;</p>'],
  ['A <x a="\\*">text</x>.', '<p>A &lt;x a="*"&gt;text&lt;/x&gt;.</p>'],
  ['A <!-- *literal* --> *visible*.', '<p>A &lt;!-- <em>literal</em> --&gt; <em>visible</em>.</p>'],
  ['[foo <bar attr="](baz)">', '<p><a href="baz">foo</a></p>'],
];
for (const [source, broken] of sensitivityCases) {
  const expected = referenceOutput(inertRenderer, referenceParser.parse(source)).projection;
  if (JSON.stringify(semanticProjection(broken)) === JSON.stringify(expected)) {
    throw new Error(`The inert HTML comparator failed its loss-sensitivity check: ${JSON.stringify(source)}`);
  }
}
for (const literal of ['<x a="one  two">', '<x a="one\u00a0two">']) {
  const damaged = schema.node('paragraph', {}, [schema.text(literal.replace(/ {2}|\u00a0/u, ' '))]);
  if (retainsLiteralHTML(damaged, [['inline', literal]])) throw new Error('The literal HTML guard accepted whitespace corruption.');
}
console.log(`Reference parser reproduced all ${commonmarkSpec.tests.length} official HTML outputs exactly.`);
console.log(`Inert raw HTML: ${htmlPolicyExamples.size - htmlPolicyFailures.length}/${htmlPolicyExamples.size} semantic, ${htmlPolicyExamples.size - htmlTokenFailures.length}/${htmlPolicyExamples.size} exact token contracts; ${generatedCases.length - generatedFailures.length}/${generatedCases.length} generated boundary/round-trip contracts.`);
console.log(`Oracle sensitivity: ${sensitivityCases.length} semantic and 2 literal-whitespace corruptions rejected; reference parser absent from ${runtimeMaps.length} runtime source maps.`);
if (htmlPolicyReport) {
  console.log(`Inert raw HTML policy: ${htmlPolicyExamples.size - htmlPolicyFailures.length}/${htmlPolicyExamples.size} reference semantic contracts match.`);
  for (const failure of htmlPolicyFailures) console.log(JSON.stringify(failure));
  console.log(`Raw HTML token streams: ${htmlPolicyExamples.size - htmlTokenFailures.length}/${htmlPolicyExamples.size} exact literal contracts match.`);
  for (const failure of htmlTokenFailures) console.log(JSON.stringify(failure));
  for (const failure of generatedFailures) console.log(JSON.stringify(failure));
}

const required = expandRanges(baseline.requiredMatchRanges);
// An explicit syntax policy, not a reclassification of the default dialect.
// Check every already-matching case as well as the three literal-address cases.
const literalAddressExamples = new Set([...required, 608, 611, 612]);
for (const example of commonmarkSpec.tests.filter(example => literalAddressExamples.has(example.number))) {
  const source = materializeTabs(example.markdown);
  const expected = referenceOutput(referenceRenderer, referenceParser.parse(source)).projection;
  const document = MarkdownImporter.parse(source, schema, { autolinkLiterals: false });
  const actual = semanticProjection(HTMLExporter.export(document, { document: false }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Literal-address import policy disagrees with CommonMark example ${example.number}.`);
  }
}
console.log(`Literal-address import policy: ${literalAddressExamples.size} reference semantic contracts passed (default baseline unchanged).`);
const pending = expandRanges(baseline.pendingMismatchRanges);
const intentional = new Set(baseline.intentionalDivergences.flatMap(({ exampleRanges }) => (
  [...expandRanges(exampleRanges)]
)));
const divergenceFailures = [];
for (const group of baseline.intentionalDivergences) {
  if (!group.contract) continue;
  if (group.contract !== 'editable-caret-hosts-v1') throw new Error(`Unknown divergence contract: ${group.contract}`);
  for (const number of expandRanges(group.exampleRanges)) {
    const mismatch = mismatches.find(example => example.number === number);
    if (!mismatch || mismatch.error || JSON.stringify(mismatch.actual) !== JSON.stringify(withEditableCaretHosts(mismatch.expected))) {
      divergenceFailures.push(number);
      continue;
    }
    // Lock the actual official source as well as canonical round trips. A
    // caret representation difference must not waive source/content loss.
    const imported = MarkdownImporter.parseWithSource(mismatch.source, schema);
    if (MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== mismatch.source
      || !MarkdownImporter.parse(MarkdownExporter.export(imported.document), schema).eq(imported.document)) {
      divergenceFailures.push(number);
    }
  }
}
const classifications = [required, pending, intentional];
if (!Array.isArray(baseline.pendingWorkGroups) || !baseline.pendingWorkGroups.length) {
  throw new Error('Pending CommonMark examples need concrete work groups.');
}
const pendingGroups = baseline.pendingWorkGroups.map(({ name, exampleRanges, requiredProof }) => {
  if (!name || !exampleRanges || !requiredProof) throw new Error('Every pending work group needs a name, examples, and proof requirements.');
  const examples = expandRanges(exampleRanges);
  if ([...examples].some(number => !pending.has(number))) throw new Error(`${name} includes an example that is not pending.`);
  return { name, examples };
});
for (const number of pending) {
  if (pendingGroups.filter(group => group.examples.has(number)).length !== 1) {
    throw new Error(`Pending CommonMark example ${number} needs exactly one work group.`);
  }
}
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
  console.log('Pending implementation work:');
  for (const group of pendingGroups) console.log(`- ${group.name}: ${group.examples.size}`);
  console.log('Remaining mismatches by section:');
  for (const [section, examples] of [...mismatchSections].sort((left, right) => left[0].localeCompare(right[0]))) {
    console.log(`- ${section}: ${examples.length}${showMismatches ? ` (${compressRanges(examples)})` : ''}`);
  }
}
for (const number of inspectedExamples) {
  const example = commonmarkSpec.tests.find((candidate) => candidate.number === number);
  const mismatch = mismatches.find((candidate) => candidate.number === number);
  if (!example) throw new Error(`Unknown CommonMark example ${number}.`);
  const source = materializeTabs(example.markdown);
  console.log(`Example ${number} (${example.section}) source:\n${JSON.stringify(source)}`);
  console.log(`Expected projection:\n${JSON.stringify(referenceOutput(referenceRenderer, referenceParser.parse(source)).projection, null, 2)}`);
  console.log(`Fountain projection:\n${JSON.stringify(mismatch?.actual ?? semanticProjection(HTMLExporter.export(MarkdownImporter.parse(source, schema), { document: false })), null, 2)}`);
  if (mismatch?.error) console.log(`Fountain error: ${mismatch.error}`);
}

// This is an opt-in source-retention contract, never a semantic conformance
// score. Keep it separate from the default-policy classifications above.
let flowSourceChecks = 0;
for (const example of commonmarkSpec.tests) {
  for (const ending of ['\n', '\r\n']) {
    const source = materializeTabs(example.markdown).replaceAll('\n', ending);
    const imported = MarkdownImporter.parseWithSource(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseFlow });
    if (MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== source) {
      throw new Error(`HTML flow source-retention regression in CommonMark example ${example.number}.`);
    }
    flowSourceChecks++;
  }
}
console.log(`Opt-in HTML flow: ${flowSourceChecks} exact-source contracts passed (LF/CRLF); not semantic conformance.`);

// Diagnose the real rich-import route separately from source snapshots and
// the intentionally inert default. Compare rendered meaning, never native ASTs.
{
  const flowBaseline = JSON.parse(readFileSync(new URL('../tests/fixtures/markdown/commonmark-html-projection-baseline-v1.json', import.meta.url), 'utf8'));
  if (flowBaseline.standard !== baseline.standard || flowBaseline.projectionVersion !== baseline.projectionVersion) {
    throw new Error('The opt-in HTML baseline must use the same standard and neutral projection.');
  }
  const flowRequired = expandRanges(flowBaseline.requiredMatchRanges);
  const flowUnresolved = expandRanges(flowBaseline.unresolvedRanges);
  for (let number = 1; number <= 652; number++) {
    if (Number(flowRequired.has(number)) + Number(flowUnresolved.has(number)) !== 1) {
      throw new Error(`Opt-in HTML example ${number} needs exactly one baseline classification.`);
    }
  }
  const flowMatches = new Set();
  const flowMismatches = [];
  const flowResults = [];
  for (const example of commonmarkSpec.tests) {
    const source = materializeTabs(example.markdown);
    const expected = referenceOutput(referenceRenderer, referenceParser.parse(source)).projection;
    const issues = [];
    const fallbacks = [];
    const importer = new ServerHTMLImporter();
    let actual;
    let error = null;
    try {
      const document = MarkdownImporter.parse(source, schema, {
        parseHTMLFlow(segments, target) {
          const result = importer.parseFlowWithReport(segments, target);
          issues.push(...result.issues);
          return result.nodes;
        },
        parseHTMLInline(segments, target) {
          const result = importer.parseInlineWithReport(segments, target);
          issues.push(...result.issues);
          return result.nodes;
        },
        onHTMLFlowFallback: issue => fallbacks.push({ kind: 'block', ...issue }),
        onHTMLInlineFallback: issue => fallbacks.push({ kind: 'inline', ...issue }),
      });
      actual = semanticProjection(HTMLExporter.export(document, { document: false }));
    } catch (cause) { error = String(cause); }
    const matched = !error && JSON.stringify(actual) === JSON.stringify(expected);
    const result = { number: example.number, matched, source, expected, actual, issues, fallbacks, error };
    flowResults.push(result);
    if (matched) flowMatches.add(example.number);
    else flowMismatches.push(result);
  }
  console.log(`Opt-in HTML block + inline semantics: ${flowMatches.size}/652 exact neutral-projection matches; remaining differences unresolved, not full conformance.`);
  if (htmlFlowReport) {
    console.log(`Opt-in matching ranges: ${compressRanges(flowMatches)}`);
    console.log(`Opt-in mismatching ranges: ${compressRanges(flowMismatches.map(example => example.number))}`);
  }
  for (const example of flowResults) {
    if (htmlFlowReport && ((showMismatches && !example.matched) || inspectedExamples.has(example.number))) console.log(JSON.stringify({ htmlFlow: example }));
  }
  const regressions = [...flowRequired].filter(number => !flowMatches.has(number));
  const gains = [...flowUnresolved].filter(number => flowMatches.has(number));
  if (flowMismatches.some(example => example.error)) throw new Error('Opt-in HTML corpus import threw; use --html-flow-report --show-mismatches.');
  if (regressions.length) throw new Error(`Opt-in HTML semantic regressions: ${compressRanges(regressions)}`);
  if (gains.length && !reportOnly) throw new Error(`Review newly matching opt-in HTML examples: ${compressRanges(gains)}`);
}

if (roundTripFailures.length) throw new Error(`Opaque HTML canonical round-trip regressions: ${compressRanges(roundTripFailures)}`);
if (htmlPolicyFailures.length || htmlTokenFailures.length || generatedFailures.length) throw new Error('Inert HTML reference policy regressed; use --html-policy-report for details.');
if (divergenceFailures.length) throw new Error(`Intentional divergence contract regressions: ${compressRanges(divergenceFailures)}`);
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
