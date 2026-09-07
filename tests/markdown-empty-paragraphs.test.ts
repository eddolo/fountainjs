import { describe, expect, it } from 'vitest';
import { CoreExtension, CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema, composeExtensions } from '../src';
import { PagesExtension } from '../src/pages';
import { DetailsExtension } from '../src/details';

describe('explicit empty-paragraph Markdown fidelity', () => {
  const schema = new Schema(CoreSchemaSpec);
  const empty = () => schema.node('paragraph', {}, [schema.text('')]);
  const text = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);

  it('preserves leading, adjacent, middle, and trailing authored blank paragraphs', () => {
    const doc = schema.node('doc', {}, [empty(), empty(), text('Body'), empty(), text('After'), empty(), empty()]);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.losses).toEqual([]);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(doc.toJSON());
  });

  it('preserves both childless and text-caret empty paragraph representations', () => {
    const doc = schema.node('doc', {}, [schema.node('paragraph'), empty()]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each(['strong', 'em', 'strike', 'code', 'underline', 'subscript', 'superscript', 'highlight'])('preserves an empty %s text mark without creating visible Markdown syntax', name => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('', [schema.marks[name].create()])])]);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.losses).toEqual([]);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(doc.toJSON());
  });

  it('preserves adjacent empty mark runs and nested marks around empty links', () => {
    const strong = schema.marks.strong.create();
    const em = schema.marks.em.create();
    const link = schema.marks.link.create({ href: '/target', title: 'Details', target: '_blank' });
    for (const content of [
      [schema.text('', [strong]), schema.text('', [em]), schema.text('After')],
      [schema.text('', [strong, em])], [schema.text('', [link, strong])], [schema.text('', [strong, link])],
    ]) {
      const doc = schema.node('doc', {}, [schema.node('paragraph', {}, content)]);
      const result = MarkdownExporter.exportWithReport(doc);
      expect(result.losses).toEqual([]);
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(doc.toJSON());
    }
  });

  it.each(['bullet_list', 'ordered_list', 'task_list'])('keeps a blank first paragraph and subsequent code inside %s', type => {
    const itemType = type === 'task_list' ? 'task_item' : 'list_item';
    const doc = schema.node('doc', {}, [schema.node(type, type === 'ordered_list' ? { start: 12 } : {}, [
      schema.node(itemType, {}, [empty(), schema.node('code_block', { language: 'text', lineNumbers: true }, [schema.text('literal')]), empty()]),
      schema.node(itemType, {}, [empty(), text('Body')]),
    ])]);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.losses).toEqual([]);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(doc.toJSON());
  });

  it('preserves empty paragraphs through quote, details, and footnote containers', () => {
    const extended = new Schema(composeExtensions([CoreExtension, PagesExtension, DetailsExtension]).schema);
    const blank = () => extended.node('paragraph', {}, [extended.text('')]);
    const doc = extended.node('doc', {}, [
      extended.node('blockquote', {}, [blank(), blank()]),
      extended.node('details', { open: false }, [extended.node('details_summary', {}, [extended.text('More')]), blank(), blank()]),
      extended.node('footnote_definition', { id: 'note' }, [blank(), blank()]),
    ]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), extended).toJSON()).toEqual(doc.toJSON());
  });

  it('keeps marker-shaped text inside fenced and inert HTML blocks literal', () => {
    const marker = '<p data-fountain-empty="text"></p>';
    for (const source of ['```text\n' + marker + '\n```', '<script>\n' + marker + '\n</script>']) {
      expect(MarkdownImporter.parse(source, schema).textContent).toContain(marker);
    }
    for (const source of ['<p data-fountain-empty="text" onclick="evil()"></p>', '<p data-fountain-empty="text">content</p>']) {
      expect(MarkdownImporter.parse(source, schema).textContent).toBe(source);
    }
  });

  it('reports explicit omission without moving the following code out of its list', () => {
    const doc = schema.node('doc', {}, [schema.node('bullet_list', {}, [
      schema.node('list_item', {}, [empty(), schema.node('code_block', { language: 'text', lineNumbers: true }, [schema.text('literal')]), empty()]),
    ]), empty()]);
    const losses: unknown[] = [];
    const result = MarkdownExporter.exportWithReport(doc, { emptyParagraphs: 'omit', onLoss: loss => losses.push(loss) });
    expect(result.markdown).not.toContain('data-fountain-empty');
    expect(result.losses.map(loss => loss.path)).toEqual([[0, 0, 0], [0, 0, 2], [1]]);
    expect(losses).toEqual(result.losses);
    const roundTrip = MarkdownImporter.parse(result.markdown, schema);
    expect(roundTrip.childCount).toBe(1);
    expect(roundTrip.child(0).child(0).child(0).type.name).toBe('code_block');
    expect(roundTrip.textContent).toBe('literal');
  });

  it('honors explicit empty-paragraph omission for a styled blank but retains an empty link destination', () => {
    const doc = schema.node('doc', {}, [
      schema.node('paragraph', {}, [schema.text('', [schema.marks.strong.create()])]),
      schema.node('paragraph', {}, [schema.text('', [schema.marks.link.create({ href: '/target' })])]),
    ]);
    const exported = MarkdownExporter.exportWithReport(doc, { emptyParagraphs: 'omit' });
    expect(exported.markdown).not.toContain('strong');
    expect(exported.markdown).toContain('[](/target)');
    expect(exported.losses.map(loss => loss.path)).toEqual([[0]]);
  });

  it('keeps adjacent markers self-contained before reference and footnote definitions', () => {
    const extended = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const source = '<p data-fountain-empty="text"></p>\n[guide]: /real\n[^note]: Evidence\n\n[guide]';
    const doc = MarkdownImporter.parse(source, extended);
    expect(doc.childCount).toBe(3);
    expect(doc.child(0).textContent).toBe('');
    expect(doc.child(1).child(0).marks[0].attrs.href).toBe('/real');
    expect(doc.child(2).type.name).toBe('footnote_definition');
    expect(doc.child(2).textContent).toBe('Evidence');
  });

  it.each(['- ', '> '])('ends the empty marker before a lazy %s paragraph continuation', prefix => {
    const continuation = prefix === '- ' ? '  ' : '> ';
    const doc = MarkdownImporter.parse(`${prefix}<p data-fountain-empty="text"></p>\n${continuation}Body\nlazy continuation`, schema);
    expect(doc.childCount).toBe(1);
    const contents = prefix === '- ' ? doc.child(0).child(0) : doc.child(0);
    expect(contents.childCount).toBe(2);
    expect(contents.child(0).textContent).toBe('');
    expect(contents.child(1).textContent).toBe('Body lazy continuation');
  });

  it('preserves original source until editing adds or replaces an empty paragraph', () => {
    const source = '# Original ###\r\n\r\nAfter\r\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    for (const content of [
      [imported.document.child(0), empty()],
      [empty(), ...imported.document.content, empty()],
    ]) {
      const changed = schema.node('doc', {}, content);
      const exported = MarkdownExporter.exportWithSource(changed, imported.source);
      expect(exported.markdown).toContain('# Original ###');
      expect(exported.markdown).toContain('data-fountain-empty');
      expect(MarkdownImporter.parse(exported.markdown, schema).toJSON()).toEqual(changed.toJSON());
    }
  });
});
