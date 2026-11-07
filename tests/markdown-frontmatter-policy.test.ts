import { expect, it } from 'vitest';
import { CoreSchemaSpec } from '../src/extensions';
import { MarkdownExporter, MarkdownImporter, Schema, type MarkdownImportOptions } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const options = { frontmatter: 'markdown', autolinkLiterals: false } as const;

it.each(['\n', '\r\n', '\r'])('captures a Markdown-body prefix and exact original line endings %j', ending => {
  const source = ['---', 'Title as Markdown', '---', '', 'Read https://example.com.', ''].join(ending);
  const standard = MarkdownImporter.parseWithSource(source, schema);
  expect(standard.source.frontmatter?.content).toBe('Title as Markdown' + ending);
  expect(standard.document.textContent).toBe('Read https://example.com.');

  const captured = MarkdownImporter.parseWithSource(source, schema, options);
  expect(captured.source.frontmatter).toBeUndefined();
  expect(captured.document.toJSON()).toEqual(MarkdownImporter.parse(source, schema, options).toJSON());
  expect(captured.document.content.map(node => node.type.name)).toEqual(['horizontal_rule', 'heading', 'paragraph']);
  expect(MarkdownExporter.exportWithSource(captured.document, captured.source)).toMatchObject({ preservation: 'exact', markdown: source });
});

it('uses the selected prefix policy when validating an edited source export', () => {
  const source = '---\r\nPrefix <em>inside</em>\r\n---\r\n\r\nOriginal **body**.\r\n\r\nKeep __spelling__.\r\n';
  const policy: MarkdownImportOptions = {
    ...options,
    parseHTMLInline: (segments, target) => ServerHTMLImporter.parseInline(segments, target),
  };
  const captured = MarkdownImporter.parseWithSource(source, schema, policy);
  const replacement = schema.node('paragraph', {}, [schema.text('Edited paragraph.')]);
  const changed = captured.document.copy(captured.document.content.map((block, index) => index === 2 ? replacement : block));
  const exported = MarkdownExporter.exportWithSource(changed, captured.source);
  expect(exported).toMatchObject({ preservation: 'blocks', markdown: source.replace('Original **body**.', 'Edited paragraph.') });
  expect(MarkdownImporter.parseWithSource(exported.markdown, schema, policy).document.toJSON()).toEqual(changed.toJSON());
});
