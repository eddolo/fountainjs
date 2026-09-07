import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema } from '../src';

describe('reference-definition source provenance', () => {
  it.each(['\n', '\r\n', '\r'])('preserves definition prefixes before paragraphs and headings (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['[ref]: ./first.md "First"', 'Heading', '=======', '',
      '[REF]: ./ignored.md', 'Edit.', '', 'Keep __this__ [ref].', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(0),
      schema.node('paragraph', {}, [schema.text('Changed.')]), imported.document.child(2)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('blocks');
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
    for (const content of [[imported.document.child(2), imported.document.child(0)], [imported.document.child(2)]]) {
      const moved = schema.node('doc', {}, content);
      const mapped = MarkdownExporter.exportWithSource(moved, imported.source);
      expect(mapped.preservation).toBe('mapped-blocks');
      expect(mapped.markdown).toContain('Keep __this__ [ref].');
      expect(mapped.markdown.split('[ref]:')).toHaveLength(2);
      expect(mapped.markdown.indexOf('[ref]:')).toBeLessThan(mapped.markdown.indexOf('[REF]:'));
      expect(MarkdownImporter.parse(mapped.markdown, schema).toJSON()).toEqual(moved.toJSON());
    }
  });

  it('preserves multiline prefix definitions without swallowing following literal lines', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = 'Edit.\n\n[ref]:\n  <./guide.md>\n  "First\n  title"\nKeep [ref].\n\n[unresolved]: not a destination\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed.')]), ...imported.document.content.slice(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('blocks');
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it.each(['\n', '\r\n', '\r'])('retains definitions in their original positions after an unrelated edit (%j)', ending => {
    const schema = new Schema(CoreSchemaSpec);
    const source = ['[guide]: <https://example.com/original> "Keep title"', '', '# Heading ###', '',
      'Edit this.', '', '[GUIDE]: https://example.com/ignored', '',
      'An __untouched__ [reference][guide].', '', '[unused]: ./unused.md', ''].join(ending);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(0), schema.node('paragraph', {}, [schema.text('Edited.')]), imported.document.child(2)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('blocks');
    expect(result.markdown).toBe(source.replace('Edit this.', 'Edited.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('moves or deletes blocks without orphaning reference definitions or changing first-definition precedence', () => {
    const schema = new Schema(CoreSchemaSpec);
    const definitions = '[ref]: ./first.md "First"\n[REF]: ./ignored.md';
    const source = `# Heading ###\n\nEdit this.\n\nAn __untouched__ [reference][ref].\n\n${definitions}\n`;
    const imported = MarkdownImporter.parseWithSource(source, schema);
    for (const content of [[imported.document.child(2), imported.document.child(0)], [imported.document.child(2)]]) {
      const changed = schema.node('doc', {}, content);
      const result = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(result.preservation).toBe('mapped-blocks');
      expect(result.markdown).toContain('An __untouched__ [reference][ref].');
      expect(result.markdown).toContain(definitions);
      expect(result.markdown.split('[ref]:')).toHaveLength(2);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
    }
  });

  it('retains multiline and escaped definitions for shortcut, collapsed and image references', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = 'Edit.\n\n[shortcut] and [shortcut][] and ![picture][image].\n\n[shortcut]:\n  <./a&amp;b.md>\n  "Two\n  title lines"\n[image]: ./image.png "Alt title"\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed.')]), imported.document.child(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('blocks');
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('regenerates edited destinations inline while keeping untouched references and rejects generated-definition collisions', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = 'A [first][ref-1].\n\nAn __untouched__ [second][ref-1].\n\n[ref-1]: ./old.md\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed', [schema.mark('link', { href: './new.md' })])]), imported.document.child(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('blocks');
    expect(result.markdown).toContain('[Changed](./new.md)');
    expect(result.markdown).toContain('An __untouched__ [second][ref-1].');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
    const regenerated = MarkdownExporter.exportWithSource(changed, imported.source, { linkStyle: 'reference' });
    expect(regenerated.preservation).toBe('canonical');
    expect(MarkdownImporter.parse(regenerated.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('does not turn newly inserted literal brackets into links in the preserved definition context', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = 'Edit.\n\nKeep [reference][ref].\n\n[ref]: ./guide.md\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    for (const text of ['[ref]', '[ref][]', '![image][ref]', '[ref]: ./replacement.md', '[missing][ref]']) {
      const literal = schema.node('paragraph', {}, [schema.text(text)]);
      for (const content of [[literal, imported.document.child(1)], [imported.document.child(1), literal]]) {
        const changed = schema.node('doc', {}, content);
        const result = MarkdownExporter.exportWithSource(changed, imported.source);
        expect(result.preservation).toMatch(/^(blocks|mapped-blocks)$/u);
        expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
      }
    }
  });

  it('preserves escaped and Unicode labels with their original duplicate-definition order', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = 'Edit.\n\n[one][Straße] and [two][a\\*b].\n\n[STRASSE]: ./first.md\n\n[Straße]: ./second.md\n[a\\*b]: ./escaped.md\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('mapped-blocks');
    expect(result.markdown).toContain('[one][Straße] and [two][a\\*b].');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('retains inert frontmatter and unused definitions after a structural edit', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '---\ntitle: "Reference paper"\n---\n\nEdit.\n\nKeep [safe].\n\n[safe]: ./safe.md\n[unused]: ./unused.md\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [imported.document.child(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('mapped-blocks');
    expect(result.markdown).toContain('title: "Reference paper"');
    expect(result.markdown).toContain('[unused]: ./unused.md');
    expect(MarkdownImporter.parseWithSource(result.markdown, schema).document.toJSON()).toEqual(changed.toJSON());
  });

  it('keeps rejected definitions as visible literal content rather than hiding them as source trivia', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = 'Edit.\n\nKeep [safe] and [unsafe].\n\n[safe]: ./safe.md\n[unsafe]: javascript:alert(1)\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, imported.document.content.slice(1));
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('mapped-blocks');
    expect(result.markdown).toContain('[unsafe]: javascript:alert(1)');
    expect(result.markdown).toContain('[safe]: ./safe.md');
    expect(changed.textContent).toContain('[unsafe]: javascript:alert(1)');
    expect(JSON.stringify(changed.toJSON())).not.toContain('"href":"javascript:');
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it('shares a large definition context without losing unrelated source when moving blocks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const definitions = Array.from({ length: 1000 }, (_, index) => `[ref-${index}]: ./page-${index}.md`).join('\n');
    const paragraphs = Array.from({ length: 200 }, (_, index) => `Keep __block ${index}__ [link][ref-${index * 5}].`).join('\n\n');
    const imported = MarkdownImporter.parseWithSource(`${paragraphs}\n\n${definitions}\n`, schema);
    const changed = schema.node('doc', {}, [...imported.document.content].reverse());
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('mapped-blocks');
    expect(result.markdown).toContain(definitions);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });

  it.each([
    ['canonical', 'Edit.\n\n> [ref]: ./nested.md\n\nAn [example][ref].'],
    ['blocks', 'Edit.\n\n[ref]: ./mixed.md\nAn [example][ref].\n\nAnother [ref].'],
    ['canonical', 'Edit.\n\n```markdown\n\n[ref]: ./code.md\n\n```\n\n[ref]'],
  ])('uses %s only for proven definition boundaries: %s', (preservation, source) => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed.')]), ...imported.document.content.slice(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe(preservation);
    if (preservation === 'blocks') expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(changed.toJSON());
  });
});
