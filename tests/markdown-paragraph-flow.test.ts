import { describe, expect, it } from 'vitest';
import { MarkdownImporter, MarkdownExporter, Schema, type MarkdownHTMLFlowContext } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import fixture from './fixtures/markdown/html-flow-pre-boundaries-v1.json';

describe('explicit paragraph-source HTML flow projection', () => {
  const schema = new Schema(CoreSchemaSpec);
  const parser = new ServerHTMLImporter();
  const expected: Record<string, string> = {
    'table-pre': '**Hello**,\nworld.\n',
    'soft-break': 'line one\nline two\n',
    'entity-crlf': 'A\nB\n',
    unclosed: 'line one\nline two\n',
  };

  it.each(fixture.cases.filter(test => test.id in expected))('recovers $id with source retention', test => {
    expect(typeof document).toBe('undefined');
    for (const ending of ['\n', '\r\n']) {
      const source = test.source.replaceAll('\n', ending);
      const reports: string[] = [];
      const fallbacks: unknown[] = [];
      const imported = MarkdownImporter.parseWithSource(source, schema, {
        parseHTMLFlow(segments, target, context) {
          const result = parser.parseParagraphFlowWithReport(segments, target, context);
          reports.push(...result.issues.map(issue => issue.code));
          return result.nodes;
        },
        onHTMLFlowFallback: issue => fallbacks.push(issue),
      });
      expect(fallbacks).toEqual([]);
      const codes: string[] = [];
      imported.document.descendants(node => { if (node.type.name === 'code_block') codes.push(node.textContent); });
      expect(codes).toEqual([expected[test.id]]);
      expect(reports).toContain('paragraph-flow-projection');
      expect(reports).toContain('preformatted-html-projection');
      expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
      schema.validate(imported.document);
    }
  });

  it.each(fixture.cases.filter(test => !(test.id in expected)))('still refuses $id rather than flattening structural content', test => {
    const fallbacks: unknown[] = [];
    const document = MarkdownImporter.parse(test.source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow,
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    expect(fallbacks).toHaveLength(1);
    expect(document.toJSON()).toEqual(MarkdownImporter.parse(test.source, schema).toJSON());
  });

  it('keeps the existing identity-preserving flow contract unchanged', () => {
    const node = schema.node('paragraph', {}, [schema.text('original')]);
    expect(() => ServerHTMLImporter.parseFlow([{ kind: 'html', html: '<pre>' }, { kind: 'node', node }], schema)).toThrow();
    expect(() => ServerHTMLImporter.parseParagraphFlow([{ kind: 'node', node }], schema)).toThrow('source context');
  });

  it('refuses paragraph attribute changes made by another adapter', () => {
    const source = '<div><pre>\n\nA <b>word</b>.\n\n</pre></div>';
    const fallbacks: unknown[] = [];
    MarkdownImporter.parse(source, schema, {
      parseHTMLParagraph: () => [schema.node('paragraph', { nodeId: 'keep-me' }, [schema.text('Changed')])],
      parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow,
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    expect(fallbacks).toHaveLength(1);
    expect(String((fallbacks[0] as { message: string }).message)).toMatch(/changed paragraph/);
  });

  it.each(['script', 'style', 'textarea', 'iframe', 'svg'])('refuses specialized/active %s content', tag => {
    const source = `<div><${tag}>\n\nOriginal\n\n</${tag}></div>`;
    const fallbacks: unknown[] = [];
    const document = MarkdownImporter.parse(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow,
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    expect(fallbacks).toHaveLength(1);
    expect(document.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it('requires exact current block references and observes input limits', () => {
    const source = fixture.cases.find(test => test.id === 'soft-break')!.source;
    let captured: MarkdownHTMLFlowContext | undefined;
    MarkdownImporter.parse(source, schema, {
      parseHTMLFlow(_segments, _schema, context) { captured = context; return null; },
    });
    expect(() => parser.parseParagraphFlow([{ kind: 'node', node: schema.node('paragraph') }], schema, captured)).toThrow(/unambiguous/);
    expect(() => new ServerHTMLImporter({ maxInputBytes: 4 }).parseParagraphFlow([
      { kind: 'html', html: '<div>Long input</div>' },
    ], schema, { readParagraphSources: () => [] })).toThrow(/limit/);
  });

  it('refuses custom paragraph metadata even when it is a schema default', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      paragraph: { ...CoreSchemaSpec.nodes.paragraph, attrs: { ...CoreSchemaSpec.nodes.paragraph.attrs, owner: { default: 'Alice' } } },
    } });
    const source = '<div><pre>\n\nKeep\n\n</pre></div>';
    const fallbacks: unknown[] = [];
    const parsed = MarkdownImporter.parse(source, custom, {
      parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow,
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    expect(fallbacks).toHaveLength(1);
    expect(parsed.toJSON()).toEqual(MarkdownImporter.parse(source, custom).toJSON());
  });

  it('does not confuse authored placeholder-like tags with protected text', () => {
    const source = '<div><pre><fountain-markdown-slot-0 data-index="0">Author</fountain-markdown-slot-0>\n\nKeep\n\n</pre></div>';
    const fallbacks: unknown[] = [];
    const parsed = MarkdownImporter.parse(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow,
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    expect(fallbacks).toEqual([]);
    expect(parsed.child(0).textContent).toBe('Author\nKeep\n');
  });
});
