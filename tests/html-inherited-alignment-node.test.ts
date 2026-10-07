// @vitest-environment node
import { expect, it } from 'vitest';
import { HTMLExporter, MarkdownExporter, Schema } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

it('retains inherited physical left without a DOM or a guessed automatic direction', () => {
  expect(typeof globalThis.document).toBe('undefined');
  const schema = new Schema(CoreSchemaSpec);
  const imported = ServerHTMLImporter.parseWithReport('<section dir="auto" style="text-align:left"><p>English</p></section>', schema);
  expect(imported.document.child(0).attrs).toMatchObject({ align: 'left', alignExplicit: true });
  expect(imported.document.child(0).attrs).not.toHaveProperty('dir');
  expect(imported.issues).toContainEqual(expect.objectContaining({ code: 'unmapped-block-wrapper' }));
  const html = HTMLExporter.export(imported.document, { document: false });
  expect(html).toContain('text-align:left');
  expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(imported.document.toJSON());
  expect(MarkdownExporter.exportWithReport(imported.document).losses)
    .toContainEqual(expect.objectContaining({ detail: expect.stringContaining('physical-left alignment') }));
});

it('does not make stylesheet rules or unsupported CSS values part of the inline contract', () => {
  const schema = new Schema(CoreSchemaSpec);
  const source = '<style>.aligned { text-align: right }</style><div class="aligned"><p>Unresolved stylesheet</p></div>';
  const imported = ServerHTMLImporter.parseWithReport(source, schema);
  expect(imported.document.child(0).attrs).toEqual({ align: 'left' });
  expect(imported.issues).toContainEqual(expect.objectContaining({ code: 'unmapped-block-wrapper' }));
});
