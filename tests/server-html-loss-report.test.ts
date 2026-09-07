import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core/schema';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { MarkdownImporter } from '../src/core/importers/markdown-importer';

const schema = new Schema(CoreSchemaSpec);

describe('explicit server HTML conversion losses', () => {
  it('reports comments independently of malformed HTML and without leaking their contents', () => {
    const result = ServerHTMLImporter.parseWithReport('<!-- private-token --><p>visible<!-- another-secret --></p>', schema);
    expect(result.document.textContent).toBe('visible');
    expect(result.issues).toEqual([expect.objectContaining({ code: 'discarded-html-comment' })]);
    expect(JSON.stringify(result.issues)).not.toMatch(/private-token|another-secret/);
    expect(Object.isFrozen(result.issues[0])).toBe(true);
  });

  it('reports unknown inline elements, including empty custom media, while preserving readable children', () => {
    const result = ServerHTMLImporter.parseWithReport('<p>See <responsive-image src="private-resource" /><unknown-inline>readable</unknown-inline></p>', schema);
    expect(result.document.textContent).toBe('See readable');
    expect(result.issues.map(issue => issue.code)).toEqual(['html-parse-error', 'unmapped-inline-element']);
    expect(JSON.stringify(result.issues)).not.toContain('private-resource');
  });

  it('reports unsupported formatting when the receiving schema lacks the mark', () => {
    const { em: _em, ...marks } = CoreSchemaSpec.marks!;
    const result = ServerHTMLImporter.parseWithReport('<p><em>still readable</em></p>', new Schema({ ...CoreSchemaSpec, marks }));
    expect(result.document.textContent).toBe('still readable');
    expect(result.issues.map(issue => issue.code)).toEqual(['unmapped-inline-element']);
  });

  it('does not label registered inline nodes or marks as unknown elements', () => {
    const custom = new Schema({ ...CoreSchemaSpec,
      nodes: { ...CoreSchemaSpec.nodes, badge: { inline: true, group: 'inline', atom: true, parseHTML: [{ tag: 'badge-chip' }] } },
      marks: { ...CoreSchemaSpec.marks, marker: { parseHTML: [{ tag: 'marked-text' }] } },
    });
    const result = ServerHTMLImporter.parseWithReport('<p><badge-chip></badge-chip><marked-text>label</marked-text></p>', custom);
    expect(result.document.content[0].content[0].type.name).toBe('badge');
    expect(result.document.content[0].content[1].marks[0].type.name).toBe('marker');
    expect(result.issues).toEqual([]);
  });

  it('reports only the accepted content shape, not rejected speculative projections', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      box: { group: 'block', content: 'block+', parseHTML: [{ tag: 'content-box' }] },
    } });
    expect(ServerHTMLImporter.parseWithReport('<content-box><h2>Heading</h2><p>Body</p></content-box>', custom).issues).toEqual([]);
    const lossy = ServerHTMLImporter.parseWithReport('<content-box><p><unknown-inline>Body</unknown-inline></p></content-box>', custom);
    expect(lossy.document.content[0].type.name).toBe('box');
    expect(lossy.issues.map(issue => issue.code)).toEqual(['unmapped-inline-element']);
  });

  it('reports rejected link and image URLs without exposing the URLs in diagnostics', () => {
    const source = '<p><a href="javascript:privateToken()">label</a><img src="javascript:privateImage()"></p><figure><img src=""></figure>';
    const result = ServerHTMLImporter.parseWithReport(source, schema);
    expect(result.document.textContent).toBe('label');
    expect(result.issues.map(issue => issue.code)).toEqual(['rejected-url', 'rejected-url']);
    expect(JSON.stringify(result.issues)).not.toMatch(/privateToken|privateImage/);
    expect(JSON.stringify(result.document.toJSON())).not.toContain('javascript:');
  });

  it('bounds repeated loss diagnostics by category instead of source element count', () => {
    const result = ServerHTMLImporter.parseWithReport(`<p>${'<!-- hidden --><unknown-inline>x</unknown-inline><a href="javascript:x">y</a><img>'.repeat(1000)}</p>`, schema);
    expect(result.issues).toHaveLength(4);
    expect(result.document.textContent).toBe('xy'.repeat(1000));
  });

  it('surfaces specific inline Markdown losses through the optional adapter report', () => {
    const importer = new ServerHTMLImporter();
    const codes: string[] = [];
    const doc = MarkdownImporter.parse('See <responsive-image src="x" /> text<!-- private --> and <a href="javascript:x">label</a>.', schema, {
      parseHTMLInline(segments, target) {
        const result = importer.parseInlineWithReport(segments, target);
        codes.push(...result.issues.map(issue => issue.code));
        return result.nodes;
      },
    });
    expect(doc.textContent).toBe('See  text and label.');
    expect(codes).toEqual(['html-parse-error', 'discarded-html-comment', 'unmapped-inline-element', 'rejected-url', 'inline-html-projection']);
  });
});
