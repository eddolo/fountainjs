import { describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec } from '../src/extensions';
import { MarkdownExporter, MarkdownImporter, Schema } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';
import type { MarkdownHTMLInlineSegment } from '../src/core/importers/markdown-importer';

describe('block-producing Markdown paragraph HTML adapter', () => {
  const schema = new Schema(CoreSchemaSpec);
  const options = { parseHTMLParagraph: ServerHTMLImporter.parseParagraph };

  it('splits a paragraph around HTML blocks instead of inserting blocks into inline content', () => {
    const doc = MarkdownImporter.parse('Before <div>Inside **bold**</div> After', schema, options);
    expect(doc.content.map(node => node.type.name)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
    expect(doc.content.map(node => node.textContent.trim())).toEqual(['Before', 'Inside bold', 'After', '']);
    expect(doc.child(1).content.at(-1)!.marks.map(mark => mark.type.name)).toContain('strong');
  });

  it('retains nested marks and source through HTML paragraph recovery', () => {
    const source = '<strong><em><p>Both</p></em></strong>\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    const content = imported.document.content.find(node => node.textContent === 'Both')!;
    expect(content).toBeDefined();
    expect(content.child(0).marks.map(mark => mark.type.name)).toEqual(expect.arrayContaining(['strong', 'em']));
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    schema.validate(imported.document);
  });

  it('retains block boundaries inside quotes and lists', () => {
    const quote = MarkdownImporter.parse('> Before <div>Inside</div> After', schema, options).child(0);
    expect(quote.type.name).toBe('blockquote');
    expect(quote.content.map(node => node.textContent.trim())).toEqual(['Before', 'Inside', 'After', '']);
    const item = MarkdownImporter.parse('- Before <div>Inside</div> After', schema, options).child(0).child(0);
    expect(item.content.map(node => node.textContent.trim())).toEqual(['Before', 'Inside', 'After']);
  });

  it.each([
    ['- A <p>B</p> C', [true]],
    ['- A <p>B</p> C\n\n', [true]],
    ['- A <p>B</p> C\n- D <p>E</p> F', [true, true]],
    ['- A <p>B</p> C\n\n- D <p>E</p> F', [false, false]],
    ['- A <p>B</p> C\n\n  D <p>E</p> F', [false, false]],
    ['- A <p>B</p> C\n  - nested\n\n  - other\n- D <p>E</p> F', [true, true]],
    ['- A <p>B</p> C\n  > nested\n  >\n  > other\n- D <p>E</p> F', [true, true]],
    ['- A <p>B</p> C\n  ```\n  nested\n\n  other\n  ```\n- D <p>E</p> F', [true, true]],
    ['- A <p>B</p> C\n  - nested\n\n  D <p>E</p> F', [false, false]],
    ['-     code\n\n  A <p>B</p> C', [false]],
    ['-\n\n- A <p>B</p> C', [false]],
    ['1. A <p>B</p> C\n2. D <p>E</p> F', [true, true]],
    ['> - A <p>B</p> C\n> - D <p>E</p> F', [true, true]],
    ['- > A <p>B</p> C', [false]],
    ['- [x]: /url\n\n  A <p>B</p> C', [false]],
    ['- [x]:\n    /url\n- A <p>B</p> C', [true]],
    ['- A <p>B</p> C\n  <!-- comment\n\n  still comment -->\n- Next', [true]],
  ] as const)('passes structural list context for %s', (source, expected) => {
    const contexts: boolean[] = [];
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLParagraph: (segments, target, context) => {
      expect(Object.isFrozen(context)).toBe(true);
      contexts.push(context.tightList);
      return ServerHTMLImporter.parseParagraph(segments, target, context);
    } });
    expect(contexts).toEqual(expected);
    schema.validate(doc);
  });

  it('keeps deferred list fallback literal and does not invoke a paragraph adapter twice', () => {
    const callback = vi.fn(() => null);
    const source = '- A <p>B</p> C\n\n- D <p>E</p> F';
    expect(MarkdownImporter.parse(source, schema, { parseHTMLParagraph: callback }).toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it.each(['A <pre>![image](image.png)</pre> end', 'A <script>**code**</script> end'])('retains explicit fallback for specialized content: %s', source => {
    const issues: string[] = [];
    const doc = MarkdownImporter.parse(source, schema, { ...options, onHTMLParagraphFallback: issue => issues.push(issue.reason) });
    expect(issues).toEqual(['error']);
    expect(doc.textContent).toContain(source.includes('pre') ? '<pre>' : '<script>');
  });

  it('leaves the default and inline-only adapter contracts unchanged', () => {
    const source = '<strong><p>Both</p></strong>';
    expect(MarkdownImporter.parse(source, schema).textContent).toBe(source);
    expect(MarkdownImporter.parse(source, schema, { parseHTMLInline: ServerHTMLImporter.parseInline }).textContent).toBe(source);
  });

  it.each(['decline', 'throw', 'inline', 'foreign', 'document', 'not-array'])('fails closed on invalid adapter output: %s', kind => {
    const source = 'A <div>**kept**</div> end';
    const reasons: string[] = [];
    const foreign = new Schema(CoreSchemaSpec);
    const doc = MarkdownImporter.parse(source, schema, {
      parseHTMLParagraph: () => {
        if (kind === 'throw') throw new Error('Adapter failure');
        if (kind === 'inline') return [schema.text('bad')];
        if (kind === 'foreign') return [foreign.node('paragraph')];
        if (kind === 'document') return [schema.node('doc', {}, [schema.node('paragraph')])];
        if (kind === 'not-array') return {} as never;
        return null;
      },
      onHTMLParagraphFallback: issue => reasons.push(issue.reason),
      parseHTMLInline: () => { throw new Error('Must not partially convert a failed paragraph'); },
    });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(reasons).toEqual([kind === 'decline' ? 'declined' : 'error']);
  });

  it('does not intercept headings, pipe cells, escaped tags, code or bare Markdown', () => {
    const callback = vi.fn(ServerHTMLImporter.parseParagraph);
    for (const source of ['# <em>Title</em>', '<em>Title</em>\n===', '| <em>Cell</em> |\n| --- |', 'Plain **text**', '`<p>code</p>`', '\\<div>']) {
      MarkdownImporter.parse(source, schema, { parseHTMLParagraph: callback });
    }
    expect(callback).not.toHaveBeenCalled();
  });

  it('preserves atom identity, metadata and repeated positions across block formatting', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      secret: { inline: true, group: 'inline', atom: true, attrs: { payload: { default: null } } },
    } });
    const atom = custom.node('secret', { payload: { id: 'stable', private: ['not HTML'] } });
    const html = (value: string): MarkdownHTMLInlineSegment => ({ kind: 'html', html: value, marks: [] });
    const nodes = ServerHTMLImporter.parseParagraph([
      { kind: 'node', node: atom }, html('<strong>'), html('<div>'),
      { kind: 'node', node: atom }, { kind: 'node', node: atom }, html('</div>'), html('</strong>'),
    ], custom);
    const found: typeof atom[] = [];
    nodes.forEach(node => node.descendants(child => { if (child.type.name === 'secret') found.push(child); }));
    expect(found).toHaveLength(3);
    expect(found.map(node => node.attrs)).toEqual([atom.attrs, atom.attrs, atom.attrs]);
    expect(found[0].marks).toHaveLength(0);
    expect(found.slice(1).every(node => node.marks.some(mark => mark.type.name === 'strong'))).toBe(true);
  });

  it('rejects custom atoms that consume a protected child', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      opaque: { group: 'block', atom: true, parseHTML: [{ tag: 'div[data-opaque]' }] },
    } });
    expect(() => ServerHTMLImporter.parseParagraph([
      { kind: 'html', html: '<div data-opaque>', marks: [] },
      { kind: 'node', node: custom.text('must survive') },
      { kind: 'html', html: '</div>', marks: [] },
    ], custom)).toThrow(/every Markdown node/);
  });

  it('applies limits to the wrapper and protected slots, and never executes source', () => {
    const original = schema.text('<script>not executable</script>');
    const segments: MarkdownHTMLInlineSegment[] = [{ kind: 'node', node: original }];
    expect(() => new ServerHTMLImporter({ maxInputBytes: 20 }).parseParagraph(segments, schema)).toThrow(/input limit/);
    expect(ServerHTMLImporter.parseParagraph(segments, schema)[0].child(0)).toBe(original);
    const doc = MarkdownImporter.parse('A <a href="javascript:alert(1)">link</a><div onclick="alert(2)">Text</div>', schema, options);
    expect(JSON.stringify(doc.toJSON())).not.toMatch(/javascript:|onclick/);
    expect(typeof document).toBe('undefined');
  });

  it('restores the whole inert container if surrounding block-flow recovery fails', () => {
    const source = '<table><tr><td>\n<pre>\n**Hello**,\n\n_world_.\n</pre>\n</td></tr></table>';
    const doc = MarkdownImporter.parse(source, schema, { ...options, parseHTMLFlow: ServerHTMLImporter.parseFlow });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(doc.textContent).toContain('</pre>');
  });
});
