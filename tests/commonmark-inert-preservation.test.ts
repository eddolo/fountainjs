// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseFragment } from 'parse5';
import { Schema, MarkdownImporter, MarkdownExporter, HTMLExporter,
  HTMLContainerExtension, HTMLCommentExtension, HTMLFlowExtension } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from '../src/html/inert';

// Development-only semantic oracle; never a runtime parser dependency.
const require = createRequire(import.meta.url);
const { Parser, HtmlRenderer } = require('commonmark');
const corpus = require('commonmark-spec').tests as Array<{ number: number; markdown: string; html: string }>;
const parser = new Parser(), renderer = new HtmlRenderer();
const rawTags = ['script', 'style', 'textarea'] as const;
const inlineTags = ['warning', 'bar', 'foo', 'responsive-image'];
const raw = createInertHTMLRawTextExtension({ tags: rawTags });
const inline = createInertHTMLInlineExtension({ tags: inlineTags });
const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  ...HTMLContainerExtension.nodes, ...HTMLCommentExtension.nodes, ...HTMLFlowExtension.nodes,
  ...raw.nodes, ...inline.nodes } });
const importer = new ServerHTMLImporter({ sourceTokens: true });
const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };
const numbers = [163, 170, 171, 172, 173, 176, 178, 201, 491, 524, 536, 617];

/** Compare the shared opaque element meaning, not either editor/parser AST.
 * parse5 reads reference HTML as data; scripts/styles are never executed.
 */
function opaqueElements(html: string) {
  const result: Array<{ tag: string; attributes: Record<string, string>; text: string }> = [];
  const text = (node: any): string => node.nodeName === '#text' ? node.value
    : (node.childNodes ?? []).map(text).join('');
  const visit = (node: any): void => {
    if ([...rawTags, ...inlineTags].includes(node.tagName)) result.push({
      tag: node.tagName, attributes: Object.fromEntries((node.attrs ?? []).map((attr: any) => [attr.name, attr.value])),
      text: text(node),
    });
    (node.childNodes ?? []).forEach(visit);
  };
  visit(parseFragment(html));
  return result;
}

describe('official CommonMark examples with explicit inert HTML adapters', () => {
  for (const ending of ['\n', '\r\n']) it.each(numbers)('retains opaque HTML meaning and complete reopening for example %i / ' + JSON.stringify(ending), number => {
    expect(typeof document).toBe('undefined');
    const example = corpus.find(value => value.number === number)!;
    expect(example).toBeTruthy();
    const source = example.markdown.replaceAll('\n', ending);
    const referenceHTML = renderer.render(parser.parse(source));
    expect(referenceHTML).toBe(example.html);
    const expected = opaqueElements(referenceHTML);
    expect(expected.length).toBeGreaterThan(0);
    const fallbacks: unknown[] = [];
    const captured = MarkdownImporter.parseWithSource(source, schema, {
      ...options, onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    const actual: typeof expected = [];
    captured.document.descendants(node => {
      if (node.type.name === 'html_inert_inline' || node.type.name === 'html_inert_raw_text') actual.push({
        tag: String(node.attrs.tag), attributes: node.attrs.attributes as Record<string, string>, text: node.textContent,
      });
    });
    expect(actual).toEqual(expected);
    expect(fallbacks).toEqual([]);
    expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
    const json = captured.document.toJSON();
    expect(schema.nodeFromJSON(JSON.parse(JSON.stringify(json))).toJSON()).toEqual(json);
    const html = HTMLExporter.export(captured.document, { document: false });
    expect(importer.parse(html, schema).toJSON()).toEqual(json);
    expect(MarkdownImporter.parse(MarkdownExporter.export(captured.document), schema, options).toJSON()).toEqual(json);
    // The reference element's tag/attrs are retained DATA, not live DOM behavior.
    const inspect = (node: any): void => {
      expect([...rawTags, ...inlineTags]).not.toContain(node.tagName);
      expect((node.attrs ?? []).some((attr: any) => /^on/i.test(attr.name))).toBe(false);
      (node.childNodes ?? []).forEach(inspect);
    };
    inspect(parseFragment(html));
  });
});
