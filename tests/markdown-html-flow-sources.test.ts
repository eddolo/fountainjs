import { describe, expect, it, vi } from 'vitest';
import { MarkdownImporter, MarkdownExporter, Schema, type Node, type MarkdownHTMLFlowContext, type MarkdownImportOptions } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

describe('lazy paragraph source inspection for HTML flow adapters', () => {
  const schema = new Schema(CoreSchemaSpec);
  const wrap = (text: string) => `<div><pre>\n\n${text}\n\n</pre></div>\n`;

  function capture(source: string, options: MarkdownImportOptions = {}) {
    const contexts: MarkdownHTMLFlowContext[] = [];
    const document = MarkdownImporter.parse(source, schema, {
      ...options,
      parseHTMLFlow(segments, target, context) {
        expect(target).toBe(schema);
        expect(segments.length).toBeGreaterThan(0);
        contexts.push(context!);
        return null;
      },
    });
    return { contexts, document };
  }

  it('distinguishes the proven LF/space collision without changing current fallback', () => {
    expect(typeof document).toBe('undefined');
    const multiline = capture(wrap('line one\nline two'));
    const singleline = capture(wrap('line one line two'));
    expect(multiline.document.toJSON()).toEqual(singleline.document.toJSON());
    const multi = multiline.contexts[0].readParagraphSources()[0];
    const single = singleline.contexts[0].readParagraphSources()[0];
    expect(multi.source).toBe('line one\nline two');
    expect(single.source).toBe('line one line two');
    expect(multi.segments.some(segment => segment.kind === 'node' && segment.softBreak)).toBe(true);
    expect(single.segments.some(segment => segment.kind === 'node' && segment.softBreak)).toBe(false);
  });

  it('retains raw closing tokens and emphasis before speculative HTML conversion', () => {
    const result = capture(wrap('*word*\n</pre>'), {
      parseHTMLInline: ServerHTMLImporter.parseInline,
      parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
    });
    const first = result.contexts[0].readParagraphSources()[0];
    expect(first.segments.some(segment => segment.kind === 'html' && segment.html === '</pre>')).toBe(true);
    const word = first.segments.find(segment => segment.kind === 'node' && segment.node.text === 'word');
    expect(word?.kind === 'node' && word.node.marks[0].type.name).toBe('em');
    expect(result.document.toJSON()).toEqual(MarkdownImporter.parse(wrap('*word*\n</pre>'), schema).toJSON());
  });

  it('returns a cached frozen snapshot with current output block identities', () => {
    let context: MarkdownHTMLFlowContext | undefined;
    let nodes: Node[] = [];
    MarkdownImporter.parse('<div>\n\nFirst\n\nSecond\n\n</div>', schema, {
      parseHTMLFlow(segments, target, supplied) {
        context = supplied;
        nodes = segments.flatMap(segment => segment.kind === 'node' ? [segment.node] : []);
        return ServerHTMLImporter.parseFlow(segments, target);
      },
    });
    // Assert outside the adapter: importer fallback intentionally catches host errors.
    const sources = context!.readParagraphSources();
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(sources)).toBe(true);
    expect(sources.map(source => source.blocks[0])).toEqual(nodes);
    sources.forEach((source, index) => {
      expect(source.blocks[0]).toBe(nodes[index]);
      expect(Object.isFrozen(source)).toBe(true);
      expect(Object.isFrozen(source.blocks)).toBe(true);
      expect(Object.isFrozen(source.segments)).toBe(true);
      expect(source.segments.every(Object.isFrozen)).toBe(true);
    });
    expect(context!.readParagraphSources()).toBe(context!.readParagraphSources());
  });

  it('does not rerun inline or paragraph host callbacks on inspection', () => {
    const inline = vi.fn(ServerHTMLImporter.parseInline);
    const paragraph = vi.fn(ServerHTMLImporter.parseParagraph);
    const result = capture('<div>\n\nA <b>word</b>.\n\n</div>', {
      parseHTMLInline: inline, parseHTMLParagraph: paragraph,
    });
    expect(paragraph).toHaveBeenCalledTimes(1);
    expect(inline).not.toHaveBeenCalled();
    result.contexts[0].readParagraphSources();
    result.contexts[0].readParagraphSources();
    expect(paragraph).toHaveBeenCalledTimes(1);
    expect(inline).not.toHaveBeenCalled();
  });

  it('associates one source with multiple recovered blocks or no visible blocks', () => {
    const heading = schema.node('heading', { level: 2 }, [schema.text('First')]);
    const paragraph = schema.node('paragraph', {}, [schema.text('Second')]);
    const result = capture('<div>\n\nA <b>word</b>.\n\nB <i>word</i>.\n\n</div>', {
      parseHTMLParagraph: segments => segments.some(segment => segment.kind === 'html' && segment.html === '<b>')
        ? [heading, paragraph] : [],
    });
    const sources = result.contexts[0].readParagraphSources();
    expect(sources).toHaveLength(2);
    expect(sources[0].blocks).toEqual([heading, paragraph]);
    expect(sources[0].blocks[0]).toBe(heading);
    expect(sources[1].blocks).toEqual([]);
  });

  it('keeps reference resolution, literal-address policy and hard-break atoms', () => {
    const { contexts } = capture('<div>\n\n[Ref][r] www.example.com  \nNext\n\n</div>\n\n[r]: /safe', { autolinkLiterals: false });
    const nodes = contexts[0].readParagraphSources()[0].segments.flatMap(segment => segment.kind === 'node' ? [segment.node] : []);
    expect(nodes.filter(node => node.marks.some(mark => mark.type.name === 'link'))).toHaveLength(1);
    expect(nodes.find(node => node.text === 'Ref')?.marks[0].attrs.href).toBe('/safe');
    expect(nodes.some(node => node.type.name === 'hard_break')).toBe(true);
  });

  it('keeps entity CR separate from physical LF provenance and ignores escaped tags', () => {
    const { contexts } = capture(wrap('A&#13;\nB \\<pre>'));
    const segments = contexts[0].readParagraphSources()[0].segments;
    expect(segments.every(segment => segment.kind === 'node')).toBe(true);
    expect(segments.some(segment => segment.kind === 'node' && segment.node.text?.includes('\r'))).toBe(true);
    expect(segments.some(segment => segment.kind === 'node' && segment.softBreak)).toBe(true);
  });

  it('keeps nested containers separate rather than mislabelling all descendant paragraphs as direct', () => {
    const { contexts } = capture('<div>\n\nOuter\n\n> <div>\n>\n> Inner\n>\n> </div>\n\n</div>');
    expect(contexts.map(context => context.readParagraphSources().map(source => source.source)))
      .toEqual([['Inner'], ['Outer']]);
  });

  it.each([false, true])('preserves tight-list rendering context with and without paragraph adapters (loose=%s)', loose => {
    const source = `- First\n${loose ? '\n' : ''}  <hr>\n- Second`;
    for (const options of [{}, { parseHTMLParagraph: ServerHTMLImporter.parseParagraph }]) {
      const { contexts } = capture(source, options);
      expect(contexts[0].readParagraphSources()[0].tightList).toBe(!loose);
    }
  });

  it('allocates syntax nodes only on the first inspection', () => {
    const { contexts } = capture(wrap('one\ntwo'));
    const text = vi.spyOn(schema, 'text');
    try {
      expect(text).not.toHaveBeenCalled();
      contexts[0].readParagraphSources();
      const calls = text.mock.calls.length;
      expect(calls).toBeGreaterThan(0);
      contexts[0].readParagraphSources();
      expect(text).toHaveBeenCalledTimes(calls);
    } finally { text.mockRestore(); }
  });

  it('does not mistake headings, code or raw HTML blocks for paragraph sources', () => {
    const { contexts } = capture('<div>\n\n# Heading\n\n```\ncode\n```\n\nPlain\n\n</div>');
    expect(contexts[0].readParagraphSources().map(source => source.source)).toEqual(['Plain']);
  });

  it('preserves exact CRLF file source while reporting normalized parser input', () => {
    const source = wrap('one\ntwo').replaceAll('\n', '\r\n');
    let context: MarkdownHTMLFlowContext | undefined;
    const imported = MarkdownImporter.parseWithSource(source, schema, {
      // Source capture may invoke adapters again for individual provenance probes.
      parseHTMLFlow(_segments, _schema, supplied) { context ??= supplied; return null; },
    });
    expect(context!.readParagraphSources()[0].source).toBe('one\ntwo');
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
  });

  it('retains two-argument adapter invocation compatibility', () => {
    const adapter: NonNullable<MarkdownImportOptions['parseHTMLFlow']> = ServerHTMLImporter.parseFlow;
    expect(adapter([{ kind: 'node', node: schema.node('paragraph') }], schema)).toHaveLength(1);
  });

  it('snapshots the literal-address policy before a retained context is inspected', () => {
    let context: MarkdownHTMLFlowContext | undefined;
    const options = {
      autolinkLiterals: false,
      parseHTMLFlow(_segments: unknown, _schema: unknown, supplied?: MarkdownHTMLFlowContext) {
        context = supplied;
        return null;
      },
    };
    MarkdownImporter.parse('<div>\n\nwww.example.com\n\n</div>', schema, options);
    options.autolinkLiterals = true;
    expect(context!.readParagraphSources()[0].segments.some(segment => segment.kind === 'node'
      && segment.node.marks.some(mark => mark.type.name === 'link'))).toBe(false);
  });
});
