import { HTMLExporter } from '../../dist/index.js';
import { ServerHTMLImporter } from '../../dist/html-server.js';

/** The same compiled-package contract runs in Node/Bun/Deno and real workerd. */
export function checkHTMLPageSettings(schema) {
  const pageSettings = { unit: 'pt', width: 792, height: 612, orientation: 'landscape',
    marginTop: -12.5, marginBottom: 0, marginLeft: 51.85, marginRight: 72,
    headerDistance: 18.5, footerDistance: 24, gutter: 0 };
  const doc = schema.node('doc', { pageSettings }, [schema.node('paragraph', {}, [schema.text('Physical settings')])]);
  const fullPage = HTMLExporter.export(doc);
  if (JSON.stringify(ServerHTMLImporter.parse(fullPage, schema).toJSON()) !== JSON.stringify(doc.toJSON())) {
    throw new Error('Compiled HTML page-settings interchange changed the complete document.');
  }
  if (HTMLExporter.export(doc, { document: false }).includes('data-fountain-page-settings')) {
    throw new Error('A compiled clipboard fragment acquired document page settings.');
  }
  const malformed = ServerHTMLImporter.parseWithReport('<body data-fountain-page-settings=\'{"unit":"pt","gutter":-1}\'><p>Visible</p></body>', schema);
  if (malformed.document.textContent !== 'Visible' || malformed.document.attrs.pageSettings !== undefined
    || !malformed.issues.some(issue => issue.code === 'invalid-page-settings')) {
    throw new Error('Compiled HTML importer did not reject malformed metadata without losing text.');
  }
  return true;
}
