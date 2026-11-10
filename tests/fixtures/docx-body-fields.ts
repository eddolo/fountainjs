export const wordBodyWithFields = '<w:p><w:r><w:t xml:space="preserve">Figure </w:t></w:r>'
  + '<w:r><w:fldChar w:fldCharType="begin"/><w:instrText> REF figure1 </w:instrText></w:r>'
  + '<w:r><w:instrText> \\h </w:instrText><w:fldChar w:fldCharType="separate"/></w:r>'
  + '<w:r><w:t>4</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>'
  + '<w:p><w:fldSimple w:instr="DATE"><w:r><w:t>May 1</w:t></w:r></w:fldSimple></w:p>';

const marker = (kind: 'begin' | 'separate' | 'end') => `<w:r><w:fldChar w:fldCharType="${kind}"/></w:r>`;
const code = (text: string) => `<w:r><w:instrText xml:space="preserve">${text}</w:instrText></w:r>`;
const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const formula = (value: number) => marker('begin') + code(` = ${value} `) + marker('separate') + run(String(value)) + marker('end');

export const wordBodyWithNestedField = '<w:p>' + run('Condition: ') + marker('begin') + code(' IF 1 = ')
  + formula(1) + code(' "Equal 7" "Different" ') + marker('separate') + run('Equal ') + formula(7) + marker('end') + '</w:p>';
