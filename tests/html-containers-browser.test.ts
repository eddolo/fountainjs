// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { HTMLImporter, HTMLExporter, Schema, HTMLContainerExtension, StarterKit, composeExtensions } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([...StarterKit.extensions, HTMLContainerExtension]).schema);

it.each(['<hr>', '<p></p>', '<div></div>', '<section><hr></section>'])('retains block-only section children: %s', child => {
  const source = `<section id="outer">${child}</section>`;
  const browser = HTMLImporter.parse(source, schema);
  const server = ServerHTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(server.toJSON());
  expect(browser.child(0).childCount).toBe(1);
  expect(HTMLExporter.export(server, { document: false })).toBe(source);
});

it('uses equivalent browser and DOM-free container rules', () => {
  for (const source of [
    '<section id="release" dir="rtl"><div class="notes"><p>One <em>paragraph</em>.</p><p>Two.</p></div></section>',
    '<div></div>', '<article><ol start="3"><li>One</li><li>Two</li></ol></article>',
    '<section dir="auto"><h2>שלום</h2><p>English inherits.</p><p style="text-align:left">Explicit left</p><section dir="ltr"><p>Fixed context</p></section></section>',
  ]) expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
});

it('uses the same shared direction scope in browser and DOM-free parsing', () => {
  const source = '<div data-fountain-direction-scope="" dir="auto"><ol start="0"><li><p>שלום</p></li></ol><p>English</p><ul><li><p>Tail</p></li></ul></div>';
  const browser = HTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
  expect(browser.child(0).type.name).toBe('direction_scope');
  expect(HTMLExporter.export(browser, { document: false })).toBe(source);
  const unsupported = source.replace('dir="auto"', 'dir="auto" data-private="not-retained"');
  const server = ServerHTMLImporter.parseWithReport(unsupported, schema);
  expect(HTMLImporter.parse(unsupported, schema).toJSON()).toEqual(server.document.toJSON());
  expect(server.document.child(0).type.name).not.toBe('direction_scope');
  expect(server.issues.length).toBeGreaterThan(0);
  const fixed = unsupported.replace('dir="auto"', 'dir="rtl"');
  const fixedResult = ServerHTMLImporter.parseWithReport(fixed, schema);
  expect(HTMLImporter.parse(fixed, schema).toJSON()).toEqual(fixedResult.document.toJSON());
  expect(fixedResult.document.child(1).attrs.dir).toBe('rtl');
});

it('declines unsupported attributes in browser and server instead of claiming they survived', () => {
  const source = '<section data-private="secret"><p>Visible</p></section>';
  const server = ServerHTMLImporter.parseWithReport(source, schema);
  expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(server.document.toJSON());
  expect(server.document.child(0).type.name).toBe('paragraph');
  expect(server.issues.some(issue => issue.code === 'unmapped-block-wrapper')).toBe(true);
});
