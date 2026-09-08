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
  ]) expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
});

it('declines unsupported attributes in browser and server instead of claiming they survived', () => {
  const source = '<section data-private="secret"><p>Visible</p></section>';
  const server = ServerHTMLImporter.parseWithReport(source, schema);
  expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(server.document.toJSON());
  expect(server.document.child(0).type.name).toBe('paragraph');
  expect(server.issues.some(issue => issue.code === 'unmapped-block-wrapper')).toBe(true);
});
