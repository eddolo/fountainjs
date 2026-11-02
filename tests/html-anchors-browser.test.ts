// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { CoreExtension, HTMLAnchorExtension, HTMLImporter, HTMLExporter, Schema, composeExtensions } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([CoreExtension, HTMLAnchorExtension]).schema);

it.each([
  '<p>Before <a id="chapter" name="legacy">Chapter <em>one</em></a> after</p>',
  '<p><a></a><a id=""></a><a href="">Clickable</a></p>',
  '<p><a id="chapter" class="bookmark" title="A &amp; B" lang="en" dir="rtl">שלום</a></p>',
  '<p><a id="chapter" onclick="alert(1)">Readable</a></p>',
  '<p><a id="chapter"><a href="/guide">Nested link</a> tail</a></p>',
  '<p><a id="chapter">outer <a id="inner">inner</a></a></p>',
  '<p><strong><a id="chapter">Bold bookmark</a></strong></p>',
])('agrees with the server about bookmark structure and HTML recovery: %s', source => {
  const browser = HTMLImporter.parse(source, schema);
  const server = ServerHTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(server.toJSON());
  const exported = HTMLExporter.export(browser, { document: false });
  expect(HTMLImporter.parse(exported, schema).toJSON()).toEqual(browser.toJSON());
  expect(ServerHTMLImporter.parse(exported, schema).toJSON()).toEqual(browser.toJSON());
});
