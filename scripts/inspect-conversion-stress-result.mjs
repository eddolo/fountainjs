// Independent package inventory for the recorded DOCX audit, not a fidelity gate.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const sourceDir = resolve('artifacts/conversion-real-use/source');
const resultDir = resolve(process.argv[2] ?? 'artifacts/conversion-real-use/results/conversion-real-document-a-7af3f-ific-DOCX-in-the-public-lab');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function inventory(path) {
  const bytes = readFileSync(path);
  const archive = unzipSync(bytes);
  const xml = strFromU8(archive['word/document.xml']);
  return {
    sha256: hash(bytes),
    nativeEquations: [...xml.matchAll(/<m:oMath(?=[\s>])/g)].length,
    footnoteReferences: [...xml.matchAll(/<w:footnoteReference(?=[\s/>])/g)].length,
    explicitPageBreaks: [...xml.matchAll(/<w:br\b[^>]*w:type="page"/g)].length,
    tables: [...xml.matchAll(/<w:tbl(?=[\s>])/g)].length,
    section: xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0],
    // This independent fixture and Fountain output use the Word w prefix.
    // Compare only size/margin values, not rewritten relationship identifiers.
    pageSettings: Object.fromEntries(['pgSz', 'pgMar'].map(tag => [tag, Object.fromEntries(
      [...(xml.match(new RegExp(`<w:${tag}\\b[^>]*>`))?.[0] ?? '').matchAll(/w:([\w]+)="([^"]*)"/g)].map(match => [match[1], match[2]])
    )])),
    headerParts: Object.keys(archive).filter(name => /^word\/header\d+\.xml$/.test(name)),
    footnotePartPresent: Boolean(archive['word/footnotes.xml']),
    media: Object.entries(archive).filter(([name]) => name.startsWith('word/media/')).map(([name, data]) => ({ name, bytes: data.length, sha256: hash(data) })),
  };
}
const source = inventory(resolve(sourceDir, 'cooling-report.docx'));
const exported = inventory(resolve(resultDir, 'edited-export.docx'));
const manifest = JSON.parse(readFileSync(resolve(sourceDir, 'manifest.json'), 'utf8'));
const report = JSON.parse(readFileSync(resolve(resultDir, 'lab-report.json'), 'utf8'));
const table = report.importedDocument.content.find(node => node.type === 'table');
const result = {
  source, exported,
  pageSettingsMatch: JSON.stringify(source.pageSettings) === JSON.stringify(exported.pageSettings),
  recoveredBodyImages: ['apparatus.jpg', 'cooling-plot.png'].map((name, index) => {
    const recoveredHash = hash(readFileSync(resolve(resultDir, `recovered-image-${index + 1}.bin`)));
    return { name, sha256: recoveredHash, matchesOriginalAsset: recoveredHash === manifest.assets[name], retainedInExport: exported.media.some(media => media.sha256 === recoveredHash) };
  }),
  headerLogoRetainedInExport: exported.media.some(media => media.sha256 === manifest.assets['header-logo.png']),
  tableFirstCell: table.content[0].content[0],
  importIssueCodes: report.importIssues.map(issue => issue.code),
  roundTrip: report.roundTrip,
};
writeFileSync(resolve(resultDir, 'structure-check.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
