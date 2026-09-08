import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/** Independently authored control XML in an ordinary, styled DOCX envelope. */
export function contentControlFixture(envelope: Uint8Array): Uint8Array {
  const parts = unzipSync(envelope);
  const p = (text: string, properties = '') => `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const control = (content: string) => `<w:sdt><w:sdtPr><w:alias w:val="Handover field"/><w:lock w:val="sdtContentLocked"/><w:dataBinding w:xpath="/handover/owner"/></w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`;
  const numbered = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
  const body = p('Operational handover', '<w:pStyle w:val="Heading1"/>')
    + `<w:p><w:r><w:t xml:space="preserve">Owner </w:t></w:r>${control('<w:r><w:rPr><w:b/></w:rPr><w:t>Ada</w:t></w:r>')}</w:p>`
    + control(p('Run these checks before handing over the release.') + p('Build the release', numbered) + control(p('Verify the output', numbered)))
    + '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Service</w:t></w:r></w:p></w:tc><w:tc><w:tcPr/>'
    + control(p('API gateway') + control(p('Ready for review')))
    + '</w:tc></w:tr></w:tbl>' + p('Record the outcome after review.');
  const document = strFromU8(parts['word/document.xml']!);
  parts['word/document.xml'] = strToU8(document.replace(/<w:body>[\s\S]*?<w:sectPr>/, `<w:body>${body}<w:sectPr>`));
  return zipSync(parts);
}
