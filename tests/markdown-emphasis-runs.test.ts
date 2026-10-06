import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, MarkdownExporter, MarkdownImporter, MathExtension, Schema } from '../src';

const cases = [
  ['***a*', '<p>**<em>a</em></p>'],
  ['___a_', '<p>__<em>a</em></p>'],
  ['****a***', '<p>*<em><strong>a</strong></em></p>'],
  ['____!__', '<p>__<strong>!</strong></p>'],
  ['****)**', '<p>**<strong>)</strong></p>'],
  ['***中*', '<p>**<em>中</em></p>'],
  ['***`code`*', '<p>**<em><code>code</code></em></p>'],
  ['[***label*](/safe)', '<p><a href="/safe" target="_blank" rel="noopener noreferrer nofollow">**<em>label</em></a></p>'],
  ['Before ***!] beta **中*._`code` after.', '<p>Before ***!] beta *<em>中</em>._<code>code</code> after.</p>'],
] as const;

describe('Markdown delimiter-run precedence', () => {
  it.each(cases)('keeps surplus outside the correct nearest span: %s', (body, expectedHTML) => {
    const schema = new Schema(CoreSchemaSpec);
    for (const ending of ['\n', '\r\n']) {
      const source = body + ending;
      const parsed = MarkdownImporter.parseWithSource(source, schema, { autolinkLiterals: false });
      expect(HTMLExporter.export(parsed.document, { document: false })).toBe(expectedHTML);
      expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
      const saved = MarkdownExporter.exportWithReport(parsed.document);
      expect(saved.losses).toEqual([]);
      expect(MarkdownImporter.parse(saved.markdown, schema, { autolinkLiterals: false }).toJSON()).toEqual(parsed.document.toJSON());
    }
  });

  it('leaves unavailable formatting literal instead of deleting source', () => {
    const schema = new Schema({ ...CoreSchemaSpec, marks: {} });
    for (const source of ['***a*', '____!__', '*one* and **two**']) {
      const parsed = MarkdownImporter.parseWithSource(source, schema);
      expect(parsed.document.textContent).toBe(source);
      expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
      expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema).toJSON()).toEqual(parsed.document.toJSON());
    }
  });

  it.each([
    ['em', '*before **inside** after*', '<p><em>before **inside** after</em></p>'],
    ['strong', '**before *inside* after**', '<p><strong>before *inside* after</strong></p>'],
    ['em', '***alpha***', '<p><em>**alpha**</em></p>'],
    ['strong', '***alpha***', '<p>*<strong>alpha</strong>*</p>'],
    ['em', '*a **b** c* then **literal**', '<p><em>a **b** c</em> then **literal**</p>'],
    ['strong', '**a *b* c** then *literal*', '<p><strong>a *b* c</strong> then *literal*</p>'],
  ] as const)('keeps unavailable syntax inside its original scope with only %s: %s', (name, source, expectedHTML) => {
    const schema = new Schema({ ...CoreSchemaSpec, marks: { [name]: CoreSchemaSpec.marks![name] } });
    for (const ending of ['\n', '\r\n']) {
      const input = source + ending;
      const parsed = MarkdownImporter.parseWithSource(input, schema);
      expect(HTMLExporter.export(parsed.document, { document: false })).toBe(expectedHTML);
      expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(input);
      const saved = MarkdownExporter.exportWithReport(parsed.document);
      expect(saved.losses).toEqual([]);
      expect(MarkdownImporter.parse(saved.markdown, schema).toJSON()).toEqual(parsed.document.toJSON());
    }
  });

  it('does not use equation-source delimiters as prose emphasis', () => {
    const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...MathExtension.nodes } });
    const parsed = MarkdownImporter.parseWithSource('**Before $x*y$ after**', schema);
    const math = parsed.document.child(0).content.find(node => node.type.name === 'inline_math');
    expect(math?.attrs.latex).toBe('x*y');
    expect(math?.marks.map(mark => mark.type.name)).toEqual(['strong']);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe('**Before $x*y$ after**');
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema).toJSON()).toEqual(parsed.document.toJSON());
  });

  it('keeps unsafe link destinations inert while resolving the surrounding span', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '***[bad](javascript:alert(1))*';
    const parsed = MarkdownImporter.parseWithSource(source, schema);
    expect(parsed.document.textContent).toBe('**[bad](javascript:alert(1))');
    expect(parsed.document.child(0).content.some(node => node.marks.some(mark => mark.type.name === 'link'))).toBe(false);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });
});
