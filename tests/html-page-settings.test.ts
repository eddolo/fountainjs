// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Schema, HTMLExporter } from '../src/headless';
import { StarterKit } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { exportLab, importLab, labSchema } from '../examples/react-app/src/conversion-lab';

const schema = new Schema(StarterKit.schema);
const settings = {
  unit: 'pt', width: 792, height: 612, orientation: 'landscape', marginTop: -12.5,
  marginRight: 51.85, marginBottom: 0, marginLeft: 72, headerDistance: 18.5,
  footerDistance: 24, gutter: 0,
} as const;
const body = (source: string) => `<!doctype html><html><head></head><body data-fountain-page-settings='${source}'><p>Retained text</p></body></html>`;

describe('HTML document physical page-settings bridge', () => {
  it('round-trips all supported page fields and text through standalone HTML in pure Node', () => {
    expect(typeof document).toBe('undefined');
    const doc = schema.node('doc', { pageSettings: settings }, [schema.node('paragraph', {}, [schema.text('Retained text')])]);
    const html = HTMLExporter.export(doc);
    expect(html).toContain('<body data-fountain-page-settings="{&quot;unit&quot;:&quot;pt&quot;');
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
    const labDoc = labSchema.nodeFromJSON(doc.toJSON());
    const result = importLab(exportLab(labDoc, 'html').bytes, 'html');
    expect(result.document.toJSON()).toEqual(doc.toJSON());
    expect(exportLab(labDoc, 'html').issues.map(issue => issue.code)).not.toContain('page-settings-not-exported');
  });

  it.each([{ unit: 'pt' }, { unit: 'pt', marginLeft: 0 }, { unit: 'pt', width: 612, height: 792 }])('retains sparse settings without inventing defaults: %j', value => {
    const doc = schema.node('doc', { pageSettings: value }, [schema.node('paragraph', {}, [schema.text('Retained text')])]);
    expect(ServerHTMLImporter.parse(HTMLExporter.export(doc, { includeStyles: false }), schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each([
    '', 'null', '[]', '{', '{"unit":"px","width":612}', '{"unit":"pt","width":0}',
    '{"unit":"pt","width":1e400}', '{"unit":"pt","gutter":-1}',
    '{"unit":"pt","orientation":"sideways"}', '{"unit":"pt","style":"url(https://invalid.example)"}',
    '{"unit":"pt","__proto__":{"polluted":true}}', ' '.repeat(2049),
  ])('reports malformed/unsafe metadata without losing visible content: case %#', source => {
    const result = ServerHTMLImporter.parseWithReport(body(source), schema);
    expect(result.document.textContent).toBe('Retained text');
    expect(result.document.attrs).toEqual({});
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid-page-settings' }));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not adopt nested/head metadata, infer settings from CSS, or accept arbitrary document attributes', () => {
    const raw = JSON.stringify(settings);
    const html = `<!doctype html><html data-fountain-page-settings='${raw}'><head><meta data-fountain-page-settings='${raw}'></head><body style="width:792pt" data-private-secret="no"><section data-fountain-page-settings='${raw}'><p>Retained text</p></section></body></html>`;
    const doc = ServerHTMLImporter.parse(html, schema);
    expect(doc.attrs).toEqual({});
    expect(doc.textContent).toBe('Retained text');
  });

  it('does not attach document metadata to fragments or change exports without page settings', () => {
    const doc = schema.node('doc', { pageSettings: settings }, [schema.node('paragraph', {}, [schema.text('Retained text')])]);
    expect(HTMLExporter.export(doc, { document: false })).toBe('<p>Retained text</p>');
    const fragment = ServerHTMLImporter.parseFragmentWithReport(body(JSON.stringify(settings)), schema);
    expect(fragment).not.toHaveProperty('pageSettings');
    expect(fragment.nodes.map(node => node.textContent)).toEqual(['Retained text']);
    const unset = schema.node('doc', {}, doc.content);
    expect(HTMLExporter.export(unset)).toContain('<body>');
    expect(HTMLExporter.export(unset)).not.toContain('data-fountain-page-settings');
  });
});
