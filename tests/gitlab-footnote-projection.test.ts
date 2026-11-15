import { expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, Schema } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { inspectFootnotes, computeFootnoteNumbering } from 'fountainjs-editor/pages';
import { serializeOuter } from 'parse5';
import live from '../integrations/gitlab/fixtures/footnote-probe-live-html.json';
import { inspectGitLabFootnoteProjection, normalizeGitLabFootnoteProjection } from '../integrations/gitlab/services/footnote_projection';
import { gitLabFootnoteNodes } from '../integrations/gitlab/services/footnote_nodes';
import { prepareGitLabFootnoteProbe } from '../integrations/gitlab/services/footnote_rendering';
import { readGitLabFrontmatter } from '../integrations/gitlab/services/frontmatter';
import { gitLabHasFootnoteDefinitions, gitLabFootnoteSourceDefinitions } from '../integrations/gitlab/services/footnote_source';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...gitLabFootnoteNodes() } });
const fixture = (name: string) => live.fixtures.find(item => item.name === name)!;
const normalize = (item: typeof live.fixtures[number], probe = false) => {
  let next = 0;
  return normalizeGitLabFootnoteProjection(probe ? item.probe!.source : item.source,
    probe ? item.probeBody! : item.body, { ...(probe ? { probe: item.probe,
      expectedDefinitions: gitLabFootnoteSourceDefinitions(item.source, 1_048_576).length } : {}), idFactory: () => `note-${++next}` });
};
const parseDefinitions = (result: ReturnType<typeof normalize>) => new ServerHTMLImporter().parseWithReport(
  result.definitions.map(definition => serializeOuter(definition.element)).join('\n'), schema);
it.each(live.fixtures)('inspects the actual $name normal rendering without inferring identity from DOM IDs', item => {
  expect(typeof globalThis.document).toBe('undefined');
  const result = inspectGitLabFootnoteProjection(item.source, item.body);
  expect(result.issues).toEqual([]);
  expect(result.references.every(reference => result.definitions.includes(reference.definition))).toBe(true);
});
it.each(live.fixtures.filter(item => item.probe))('validates/removes the actual $name probe and builds native note carriers', item => {
  expect(prepareGitLabFootnoteProbe(item.source, readGitLabFrontmatter(item.source)?.length ?? 0)).toEqual(item.probe);
  const result = normalize(item, true);
  if (['escaped-opening-label', 'entity-label', 'ascii-entity-label', 'decoded-bracket-entity', 'cr-unicode'].includes(item.name)) {
    expect(result.issues).toContain('footnote-omitted-definitions');
    expect(result.html).toBeUndefined();
    return;
  }
  if (item.name === 'bom-unused') {
    expect(result.issues).toContain('footnote-probe-bom');
    expect(result.html).toBeUndefined();
    return;
  }
  if (item.name === 'duplicate') {
    expect(result.issues).toContain('footnote-duplicate-label');
    expect(result.html).toBeUndefined();
    return;
  }
  if (item.name === 'body-backref-lookalike') {
    expect(result.issues).toContain('footnote-backref-source');
    expect(result.html).toBeUndefined();
    expect(serializeOuter(result.definitions[0]!.element)).toContain('and <a href="#fnref-a" data-footnote-backref="">↩</a>.');
    return;
  }
  expect(result.issues).toEqual([]);
  expect(result.html).toBeDefined();
  expect(result.html).not.toContain(item.probe!.marker);
  expect(result.html).not.toMatch(/<a\b[^>]*\bdata-footnote-backref\b/u);
  expect(result.html).not.toContain('class="footnotes"');
  if (result.definitions.length && !['links-math', 'unused-math-link', 'header-unused', 'header-example'].includes(item.name)) {
    // Inspect the native note bodies separately: the rest of this real host
    // response still needs its existing emoji/code/comment/math adapters.
    const parsed = parseDefinitions(result);
    expect(parsed.issues).toEqual([]);
    const report = inspectFootnotes(parsed.document);
    expect(report.references).toHaveLength(result.references.filter(reference => {
      let parent = reference.element.parentNode;
      while (parent && !result.definitions.some(definition => definition.element === parent))
        parent = 'parentNode' in parent ? parent.parentNode : null;
      return Boolean(parent);
    }).length);
    expect(report.definitions).toHaveLength(result.definitions.length);
  }
});
it('uses the host relation for Unicode case folding instead of JavaScript lowercasing', () => {
  const item = fixture('unicode-case'), result = normalize(item);
  expect(result.references.map(reference => reference.label)).toEqual(['STRASSE', 'Straße']);
  expect(result.references[0]!.definition).toBe(result.references[1]!.definition);
  expect(result.definitions[0]!.label).toBe('Straße');
});
it('restores first-reference definition order after the probe temporarily changes host numbering', () => {
  const result = normalize(fixture('ordered'), true);
  const parsed = new ServerHTMLImporter().parseWithReport(result.html!, schema);
  expect(parsed.issues).toEqual([]);
  const definitions = parsed.document.content.filter(node => node.type.name === 'footnote_definition');
  expect(definitions.map(node => node.attrs.gitlabFootnoteLabel)).toEqual(['b', 'a']);
  expect(computeFootnoteNumbering(parsed.document).map(entry => entry.id)).toEqual(definitions.map(node => node.attrs.id));
});
it('records the duplicate-label navigation hazard instead of treating visible numbers as identities', () => {
  const item = fixture('duplicate');
  const normal = inspectGitLabFootnoteProjection(item.source, item.body);
  const probed = inspectGitLabFootnoteProjection(item.probe!.source, item.probeBody!, { probe: item.probe });
  expect(normal.references[0]!.definition.span.from).toBe(item.source.indexOf('[^a]: First.'));
  expect(probed.references[0]!.definition.span.from).toBe(item.probe!.source.indexOf('[^a]: Second.'));
  expect(normalize(item, true).issues).toContain('footnote-duplicate-label');
});
it.each(['unreferenced', 'unused-open-fence', 'unused-nested', 'unused-multiblock', 'two-unused', 'code-candidate-and-unused', 'comment-candidate-and-unused'])('exposes omitted %s note bodies without adding references to the final document', name => {
  const item = fixture(name), normal = normalize(item), probed = normalize(item, true);
  expect(normal.definitions).toHaveLength(0);
  expect(probed.definitions.length).toBeGreaterThan(0);
  expect(probed.references).toHaveLength(0);
  const parsed = parseDefinitions(probed);
  expect(parsed.issues).toEqual([]);
  expect(inspectFootnotes(parsed.document).definitions).toHaveLength(probed.definitions.length);
  if (name === 'unused-multiblock') {
    const definition = parsed.document.content.find(node => node.type.name === 'footnote_definition')!;
    expect(definition.content.map(node => node.type.name)).toEqual(['paragraph', 'paragraph', 'bullet_list']);
    expect(definition.child(0).content.some(node => node.marks.some(mark => mark.type.name === 'strong'))).toBe(true);
  }
});
it('retains body links/math carriers while removing only generated back-reference chrome', () => {
  const result = normalize(fixture('unused-math-link'), true);
  expect(result.html).toContain('href="https://example.com"');
  expect(result.html).toContain('data-math-style="inline"');
  expect(result.html).toContain('x^2');
  expect(result.html).not.toContain('data-footnote-backref');
});
it('detects the escaped-opening definition the actual host hides even from the raw-label probe', () => {
  const item = fixture('escaped-opening-label');
  expect(item.body).not.toContain('footnotes');
  expect(item.probeBody).not.toContain('footnotes');
  expect(gitLabHasFootnoteDefinitions(item.source, 1_048_576)).toBe(true);
});
it.each(['escaped-opening-label', 'entity-label', 'ascii-entity-label', 'decoded-bracket-entity'])('refuses an incomplete %s probe even when its carrier was removed correctly', name => {
  const item = fixture(name), count = gitLabFootnoteSourceDefinitions(item.source, 1_048_576).length;
  expect(count).toBe(1);
  const result = normalizeGitLabFootnoteProjection(item.probe!.source, item.probeBody!, { probe: item.probe, expectedDefinitions: count });
  expect(result.issues).toContain('footnote-omitted-definitions');
  expect(result.html).toBeUndefined();
});
it('requires the original source count before accepting a probe and retains literal source examples', () => {
  const item = fixture('simple');
  expect(normalizeGitLabFootnoteProjection(item.probe!.source, item.probeBody!, { probe: item.probe }).issues).toContain('footnote-probe-source-count');
  expect(gitLabFootnoteSourceDefinitions(fixture('literal-code-and-spaced').source, 1_048_576)).toEqual([]);
  expect(() => gitLabFootnoteSourceDefinitions(`[^${'x'.repeat(4097)}]: body`, 1_048_576)).toThrow('label limit');
});
it('refuses forged positions, targets, ambiguous structure and unsafe or colliding IDs', () => {
  const item = fixture('simple');
  expect(inspectGitLabFootnoteProjection(item.source, item.body.replace('1:7-1:14', '1:999-1:999')).issues).toContain('footnote-source-position');
  expect(inspectGitLabFootnoteProjection(item.source, item.body.replace('>1</a>', '>999</a>')).issues).toContain('footnote-reference-target');
  expect(() => normalizeGitLabFootnoteProjection(item.source, item.body, { idFactory: () => '../unsafe' })).toThrow('safe and unique');
  const two = fixture('ordered');
  expect(() => normalizeGitLabFootnoteProjection(two.source, two.body, { idFactory: () => 'same' })).toThrow('safe and unique');
  expect(inspectGitLabFootnoteProjection(item.probe!.source, item.probeBody!.replace(item.probe!.marker, 'Changed'), { probe: item.probe }).issues).toContain('footnote-probe-carrier');
});
it('bounds probe/source/HTML work and does not mistake candidates for semantic definitions', () => {
  expect(prepareGitLabFootnoteProbe('Ordinary text.')).toBeUndefined();
  expect(() => prepareGitLabFootnoteProbe('[^a]: body', 0, 4)).toThrow('byte limit');
  expect(() => prepareGitLabFootnoteProbe('[^a]: body', 2)).toThrow('boundary');
  expect(() => prepareGitLabFootnoteProbe(Array.from({ length: 1001 }, (_, i) => `[^n${i}]: body`).join('\n'))).toThrow('reference limit');
  const item = fixture('simple');
  expect(() => inspectGitLabFootnoteProjection(item.source, item.body, { maxBytes: 8 })).toThrow('byte limit');
  expect(() => inspectGitLabFootnoteProjection(item.source, item.body, { maxNodes: 2 })).toThrow('structural limits');
  const code = fixture('code-candidate-and-unused'), result = normalize(code, true);
  expect(code.probe!.candidates).toEqual(['fake', 'real']);
  expect(result.definitions.map(definition => definition.label)).toEqual(['real']);
});
it('does not fall through to native parsing and silently drop an invalid authored label', () => {
  const parsed = new ServerHTMLImporter().parseWithReport('<p>A<sup data-fountain-footnote-reference="safe" data-gitlab-footnote-label="two words">1</sup>.</p>', schema);
  expect(parsed.issues.length).toBeGreaterThan(0);
  expect(inspectFootnotes(parsed.document).references).toHaveLength(0);
});
it('retains native IDs and the raw backslash label through headless HTML export/reopen', () => {
  const result = normalize(fixture('backslash-label'), true);
  const document = new ServerHTMLImporter().parse(result.html!, schema);
  const html = new HTMLExporter().export(document, { document: false });
  const reopened = new ServerHTMLImporter().parseWithReport(html, schema);
  expect(reopened.issues).toEqual([]);
  const before = inspectFootnotes(document), after = inspectFootnotes(reopened.document);
  expect(after.references.map(item => item.id)).toEqual(before.references.map(item => item.id));
  expect(after.definitions.map(item => item.id)).toEqual(before.definitions.map(item => item.id));
  const labels: unknown[] = [];
  reopened.document.descendants(node => { if (node.type.name.startsWith('footnote_')) labels.push(node.attrs.gitlabFootnoteLabel); });
  expect(labels).toEqual(['a\\b', 'a\\b']);
});
