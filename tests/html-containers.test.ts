import { describe, expect, it, vi } from 'vitest';
import { Schema, HTMLContainerExtension, MarkdownImporter, MarkdownExporter, HTMLExporter, composeExtensions } from '../src/headless';
import { StarterKit } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const kit = composeExtensions([...StarterKit.extensions, HTMLContainerExtension]);
const schema = new Schema(kit.schema);

describe('optional HTML section containers', () => {
  it('preserves nested wrappers, supported attributes and rich descendants without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const source = '<section id="release" class="notes" title="Release notes" lang="en" dir="ltr"><h2>Release</h2><div><p>First <em>paragraph</em>.</p><p>Second paragraph.</p></div></section>';
    const result = ServerHTMLImporter.parseWithReport(source, schema);
    expect(result.issues).toEqual([]);
    expect(result.document.child(0).type.name).toBe('html_container');
    expect(result.document.child(0).attrs).toEqual({ tag: 'section', id: 'release', className: 'notes', title: 'Release notes', lang: 'en', dir: 'ltr' });
    expect(result.document.child(0).child(1).content.map(node => node.textContent)).toEqual(['First paragraph.', 'Second paragraph.']);
    expect(HTMLExporter.export(result.document, { document: false })).toBe(source);
  });

  it.each(['div', 'section', 'article', 'aside', 'nav', 'main', 'header', 'footer', 'address'])('retains an empty %s as an empty container, not a fake paragraph', tag => {
    const doc = ServerHTMLImporter.parse(`<${tag}></${tag}>`, schema);
    expect(doc.child(0).attrs.tag).toBe(tag);
    expect(doc.child(0).childCount).toBe(0);
    expect(HTMLExporter.export(doc, { document: false })).toBe(`<${tag}></${tag}>`);
  });

  it('preserves Markdown source and canonical rich structure across explicitly enabled HTML', () => {
    for (const ending of ['\n', '\r\n']) {
      const source = '<div id="release">\n\n# Release\n\nFirst **paragraph**.\n\n- One\n- Two\n\n</div>'.replaceAll('\n', ending);
      const fallback = vi.fn();
      const result = MarkdownImporter.parseWithSource(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
      expect(fallback).not.toHaveBeenCalled();
      expect(result.document.child(0).type.name).toBe('html_container');
      expect(result.document.child(0).child(2).type.name).toBe('bullet_list');
      expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
      const canonical = MarkdownExporter.exportWithReport(result.document);
      expect(canonical.losses.some(loss => loss.type === 'html_container')).toBe(true);
      const reopened = MarkdownImporter.parse(canonical.markdown, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow });
      expect(reopened.toJSON()).toEqual(result.document.toJSON());
    }
  });

  it('does not activate HTML parsing or change the StarterKit schema by installation', () => {
    expect(StarterKit.schema.nodes.html_container).toBeUndefined();
    const source = '<div>literal</div>';
    const result = MarkdownImporter.parseWithSource(source, schema);
    expect(result.document.child(0).type.name).not.toBe('html_container');
    expect(result.document.textContent).toBe(source);
  });

  it('does not import executable attributes or scripts into the wrapper', () => {
    const result = ServerHTMLImporter.parseWithReport('<div onclick="alert(1)" style="background:url(https://example.invalid)"><script>alert(2)</script><p>Visible</p></div>', schema);
    const html = HTMLExporter.export(result.document, { document: false });
    expect(html).toBe('<p>alert(2)</p>\n<p>Visible</p>');
    expect(result.issues.some(issue => issue.code === 'unmapped-block-wrapper')).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects unsafe tags, invalid directions and oversized attributes at the schema boundary', () => {
    for (const attrs of [{ tag: 'script' }, { tag: 'iframe' }, { dir: 'invalid' }, { id: 'x'.repeat(257) }]) {
      expect(() => schema.node('html_container', attrs)).toThrow();
    }
  });

  it('gives host-specific rules priority over the generic wrapper', () => {
    const custom = new Schema({ ...kit.schema, nodes: { ...kit.schema.nodes,
      alert: { group: 'block', content: 'block+', parseHTML: [{ tag: 'aside[data-alert]' }], toDOM: () => ['aside', { 'data-alert': '' }, 0] },
    } });
    expect(ServerHTMLImporter.parse('<aside data-alert><p>Alert</p></aside>', custom).child(0).type.name).toBe('alert');
  });
});
