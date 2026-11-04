import { describe, expect, it, vi } from 'vitest';
import { createLabContext, exportLab, importLab, sameLabDocument } from '../examples/react-app/src/conversion-lab';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema, type MarkdownHTMLFlowSegment, type Node } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const bytes = (text: string) => new TextEncoder().encode(text);
const adapterOptions = (policy: string) => policy === 'inline' ? { parseHTMLInline: ServerHTMLImporter.parseInline }
  : policy === 'block' ? { parseHTMLBlock: (html: string, target: Schema) => ServerHTMLImporter.parse(html, target) }
    : policy === 'paragraph' ? { parseHTMLParagraph: ServerHTMLImporter.parseParagraph }
      : { parseHTMLFlow: ServerHTMLImporter.parseFlow };

describe('Markdown source boundaries with optional HTML conversion enabled', () => {
  for (const ending of ['\n', '\r\n', '\r']) for (const policy of ['inline', 'block', 'flow', 'paragraph']) {
    it.each(['move', 'append', 'insert-before', 'delete-heading'] as const)(`%s keeps references with ${policy} conversion (${JSON.stringify(ending)})`, action => {
    const schema = new Schema(CoreSchemaSpec);
    const options = adapterOptions(policy);
    const source = ['[ref]: /target "Original title"', '', '# Keep [link][ref] ###', '', '~~~~js', 'first', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    const [heading, code] = imported.document.content;
    const paragraph = schema.node('paragraph', {}, [schema.text('Keep added text.')]);
    const changed = imported.document.copy(action === 'move' ? [code, heading] : action === 'append' ? [heading, code, paragraph]
      : action === 'insert-before' ? [heading, paragraph, code] : [code]);
    const exported = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(MarkdownImporter.parse(exported.markdown, schema, options).toJSON()).toEqual(changed.toJSON());
    if (action !== 'delete-heading') expect(exported.markdown).toContain('# Keep [link][ref] ###');
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    });
  }
  it.each(['replace', 'append'])('checks complete container semantics after %s rather than trusting pairs of HTML-adapted blocks', action => {
    const schema = new Schema(CoreSchemaSpec);
    const parseHTMLFlow = (segments: readonly MarkdownHTMLFlowSegment[]): readonly Node[] => {
      const trigger = segments.some(segment => segment.kind === 'node' && segment.node.textContent === 'Trigger.');
      return segments.flatMap(segment => segment.kind === 'node' ? [segment.node]
        : [schema.node('paragraph', {}, [schema.text(segment.html.replace(/\r\n$|[\r\n]$/u, ''), trigger ? [schema.mark('strong')] : [])])]);
    };
    const options = { parseHTMLFlow };
    const source = '<aside>Original.</aside>\n\nMiddle.\n\nKeep.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    expect(imported.source.blocks).toHaveLength(3);
    const changed = imported.document.copy([...imported.document.content.slice(0, action === 'replace' ? 2 : 3), schema.node('paragraph', {}, [schema.text('Trigger.')])]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(MarkdownImporter.parse(result.markdown, schema, options).toJSON()).toEqual(changed.toJSON());
    expect(result.preservation).toBe('canonical');
  });
  it.each(['inline', 'block', 'flow', 'paragraph'])('retains real %s HTML source after editing an unrelated paragraph', policy => {
    const schema = new Schema(CoreSchemaSpec), options = adapterOptions(policy);
    const source = (policy === 'block' ? '<h2>Keep</h2>' : policy === 'flow' ? '<section>Keep</section>' : 'Keep <em>source</em>.') + '\n\nEdit.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    expect(imported.source.blocks).toHaveLength(2);
    const changed = imported.document.copy([imported.document.child(0), schema.node('paragraph', {}, [schema.text('Changed.')])]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(result.preservation).toBe('blocks');
    expect(MarkdownImporter.parse(result.markdown, schema, options).toJSON()).toEqual(changed.toJSON());
  });
  it('preserves frontmatter while validating the projected body', () => {
    const schema = new Schema(CoreSchemaSpec), options = adapterOptions('inline');
    const prefix = '---\r\ntitle: Keep exact\r\n---\r\n\r\n';
    const source = prefix + 'Keep <em>source</em>.\r\n\r\nEdit.\r\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    const changed = imported.document.copy([imported.document.child(0), schema.node('paragraph', {}, [schema.text('Changed.')])]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parseWithSource(result.markdown, schema, options).document.toJSON()).toEqual(changed.toJSON());
  });
  it('does not emit speculative import fallback reports during source export', () => {
    const schema = new Schema(CoreSchemaSpec), onHTMLFlowFallback = vi.fn();
    const options = { onHTMLFlowFallback, parseHTMLFlow: (segments: readonly MarkdownHTMLFlowSegment[]) => {
      if (segments.some(segment => segment.kind === 'node' && segment.node.textContent === 'Trigger.')) throw new Error('Host declined this conversion');
      return segments.flatMap(segment => segment.kind === 'node' ? [segment.node]
        : [schema.node('paragraph', {}, [schema.text(segment.html.replace(/\r\n$|[\r\n]$/u, ''))])]);
    } };
    const imported = MarkdownImporter.parseWithSource('<aside>Original.</aside>\n\nMiddle.\n\nKeep.\n', schema, options);
    const changed = imported.document.copy([...imported.document.content.slice(0, 2), schema.node('paragraph', {}, [schema.text('Trigger.')])]);
    MarkdownExporter.exportWithSource(changed, imported.source);
    expect(onHTMLFlowFallback).not.toHaveBeenCalled();
  });
  for (const ending of ['\n', '\r\n', '\r']) {
    it.each(['move', 'append', 'insert-before', 'delete-heading'] as const)(
      `%s retains supported Markdown with the lab HTML option (${JSON.stringify(ending)})`, action => {
        const context = createLabContext({ preserveHTMLStructure: true });
        const source = ['[ref]: /target "Original title"', '', '# Keep [link][ref] ###', '', '~~~~js', 'first', ''].join(ending);
        const imported = importLab(bytes(source), 'markdown', context);
        const [heading, code] = imported.document.content;
        const paragraph = context.schema.node('paragraph', {}, [context.schema.text('Keep added text.')]);
        const changed = imported.document.copy(action === 'move' ? [code, heading] : action === 'append' ? [heading, code, paragraph]
          : action === 'insert-before' ? [heading, paragraph, code] : [code]);
        const exported = exportLab(changed, 'markdown', imported.source, context);
        const reopened = importLab(exported.bytes, 'markdown', context);
        expect(sameLabDocument(changed, reopened.document)).toBe(true);
        if (action !== 'delete-heading') expect(new TextDecoder().decode(exported.bytes)).toContain('# Keep [link][ref] ###');
      });
  }
});
