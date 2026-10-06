// Read-only diagnostic for the unfinished style bridge, NOT a visual fidelity gate.
// Run with the bundled Node runtime; argv[3] is the bundled jszip module directory.
// No HTTP listener, browser DOM, document rewrite, or network fetch is involved.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';

if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: audit-word-style-source.mjs SOURCE.docx BUNDLED_JSZIP_PATH');
const JSZip = createRequire(import.meta.url)(resolve(process.argv[3]));
const sourcePath = resolve(process.argv[2]);
const bytes = readFileSync(sourcePath);
const archive = await JSZip.loadAsync(bytes);
// This diagnostic uses the known local fixture's conventional style part. The
// production importer must instead resolve the relationship-owned part safely.
const source = await archive.file('word/styles.xml')?.async('string');
if (!source) throw new Error('The audit fixture has no word/styles.xml.');
const vite = await createServer({ configFile: false, logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const { parseDOCXXML } = await vite.ssrLoadModule('/src/docx/xml-parser.ts');
  const { readWordStyleSheet } = await vite.ssrLoadModule('/src/docx/style-reader.ts');
  const { importDOCX } = await vite.ssrLoadModule('/src/docx/index.ts');
  const { Schema } = await vite.ssrLoadModule('/src/core/schema/schema.ts');
  const { StarterKit } = await vite.ssrLoadModule('/src/extensions/index.ts');
  const reader = readWordStyleSheet(parseDOCXXML(source, { maxXmlNodes: 100000, maxXmlDepth: 64 }));
  const imported = importDOCX(new Uint8Array(bytes), new Schema(StarterKit.schema));
  const selectedBlocks = imported.document.content.filter(node => ['Cooling experiment report', 'Experimental setup'].includes(node.textContent))
    .map(node => ({ type: node.type.name, text: node.textContent, attrs: node.attrs }));
  console.log(JSON.stringify({
    sourcePath,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    scope: 'Internal XML decoding and run-style cascade only; not import, editing, rendering, or export fidelity.',
    browserDOMAvailable: typeof globalThis.document !== 'undefined',
    stylesDecoded: reader.styles.length,
    selectedBlocks,
    issueCounts: reader.issues.reduce((counts, issue) => ({ ...counts, [issue.code]: (counts[issue.code] ?? 0) + 1 }), {}),
    styles: Object.fromEntries(['Normal', 'Title', 'Subtitle', 'Heading1', 'Heading2', 'Caption'].map(paragraphStyle => [paragraphStyle, {
      run: reader.resolve({ paragraphStyle }),
      paragraph: reader.resolveParagraph({ paragraphStyle }),
    }])),
    sourceUnchanged: createHash('sha256').update(readFileSync(sourcePath)).digest('hex') === createHash('sha256').update(bytes).digest('hex'),
  }, null, 2));
} finally {
  await vite.close();
}
