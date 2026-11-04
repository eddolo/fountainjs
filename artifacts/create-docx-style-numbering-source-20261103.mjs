import { strToU8, zipSync } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Independent OPC input: no Fountain serializer or document model is involved.
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml = (name, content) => `<?xml version="1.0"?><w:${name} xmlns:w="${w}">${content}</w:${name}>`;
const p = (style, text, extra = '') => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const num = id => `<w:numPr><w:numId w:val="${id}"/></w:numPr>`;
const paragraphStyle = (id, properties = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:basedOn w:val="Normal"/><w:pPr>${properties}</w:pPr></w:style>`;
const abstract = (id, style, format, start, marker) => `<w:abstractNum w:abstractNumId="${id}"><w:lvl w:ilvl="0"><w:start w:val="${start}"/><w:numFmt w:val="${format}"/><w:pStyle w:val="${style}"/><w:lvlText w:val="${marker}"/></w:lvl></w:abstractNum>`;
const files = {
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
  '_rels/.rels': `<Relationships xmlns="${relationships}"><Relationship Id="document" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `<Relationships xmlns="${relationships}"><Relationship Id="styles" Type="${office}/styles" Target="styles.xml"/><Relationship Id="numbering" Type="${office}/numbering" Target="numbering.xml"/></Relationships>`,
  'word/document.xml': xml('document', '<w:body>'
    + p('Heading1', 'Pump commissioning runbook')
    + p('Normal', 'Custom Word style names must retain their actual numbering.')
    + p('RunbookStep', 'Verify the inlet pressure.') + p('RunbookStep', 'Record the outlet temperature.')
    + p('RunbookStep', 'This note is not numbered.', num(0))
    + p('Caution', 'Wear eye protection.') + p('Caution', 'Keep the bypass closed.')
    + p('ListNumber', 'This is an ordinary paragraph despite the style name.')
    + p('Normal', 'Audit complete.') + '</w:body>'),
  'word/styles.xml': xml('styles', '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>'
    + paragraphStyle('RunbookStep', num(7) + '<w:spacing w:after="120"/>')
    + paragraphStyle('Caution', num(8)) + paragraphStyle('ListNumber')),
  'word/numbering.xml': xml('numbering', abstract(9, 'RunbookStep', 'decimal', 3, '%1.')
    + abstract(10, 'Caution', 'bullet', 1, '•')
    + '<w:num w:numId="7"><w:abstractNumId w:val="9"/></w:num><w:num w:numId="8"><w:abstractNumId w:val="10"/></w:num>'),
};
const root = 'artifacts/docx-style-numbering-source-20261103';
mkdirSync(root);
const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])));
writeFileSync(root + '/runbook.docx', bytes);
writeFileSync(root + '/provenance.json', JSON.stringify({
  producer: 'Hand-authored OOXML/OPC fixture; not a Fountain export',
  SHA256: createHash('sha256').update(bytes).digest('hex'),
  expected: { orderedStart: 3, orderedItems: 2, bulletItems: 2, removedNumbering: 'This note is not numbered.', ordinaryStyle: 'This is an ordinary paragraph despite the style name.' },
  scope: 'Style/numbering linkage and removal; no independent layout or Word-render certification',
}, null, 2) + '\n');
