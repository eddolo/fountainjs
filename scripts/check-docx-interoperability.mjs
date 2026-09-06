import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { Schema, StarterKit } from '../dist/index.js';
import { exportDOCX, importDOCX } from '../dist/docx.js';

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pngBytes = Uint8Array.from(Buffer.from(pngBase64, 'base64'));
const schema = new Schema(StarterKit.schema);
const folder = await mkdtemp(join(tmpdir(), 'fountain-docx-'));
const fountainPath = join(folder, 'fountain.docx');
const pythonPath = join(folder, 'python.docx');
const imagePath = join(folder, 'pixel.png');

try {
  const image = schema.node('image_super', {
    src: `data:image/png;base64,${pngBase64}`,
    alt: 'Independent DOCX image', title: 'Fountain export', width: '320px', height: '180px',
    align: 'center', srcset: '', sizes: '', loading: 'lazy', decoding: 'async', caption: 'Portable image caption',
  });
  const source = schema.node('doc', {}, [
    schema.node('heading', { level: 1, align: 'left' }, [schema.text('Fountain interoperability')]),
    image,
    schema.node('table', {}, [schema.node('table_row', {}, [
      schema.node('table_cell', { colspan: 1, rowspan: 1, colwidth: null, background: '' }, [schema.node('paragraph', {}, [schema.text('Portable')])]),
    ])]),
  ]);
  const generated = exportDOCX(source);
  if (generated.report.fidelity !== 'bounded') throw new Error(`Fountain export was unexpectedly ${generated.report.fidelity}.`);
  await writeFile(fountainPath, generated.bytes);
  await writeFile(imagePath, pngBytes);

  const program = String.raw`
import sys
from docx import Document
from docx.shared import Inches

fountain_path, python_path, image_path = sys.argv[1:4]
fountain = Document(fountain_path)
assert fountain.paragraphs[0].text == "Fountain interoperability"
assert len(fountain.inline_shapes) == 1
assert any(p.text == "Portable image caption" for p in fountain.paragraphs)
assert fountain.tables[0].cell(0, 0).text == "Portable"

created = Document()
created.add_heading("Independent producer", level=2)
paragraph = created.add_paragraph()
paragraph.add_run("Strong from Python").bold = True
created.add_picture(image_path, width=Inches(2))
table = created.add_table(rows=1, cols=2)
table.cell(0, 0).text = "Producer"
table.cell(0, 1).text = "python-docx"
created.save(python_path)
`;

  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  let result;
  for (const executable of candidates) {
    result = spawnSync(executable, ['-c', program, fountainPath, pythonPath, imagePath], { encoding: 'utf8' });
    if (!result.error || result.error.code !== 'ENOENT') break;
  }
  if (!result || result.error) throw result?.error ?? new Error('Python was not found.');
  if (result.status !== 0) throw new Error(`python-docx interoperability failed:\n${result.stderr || result.stdout}`);

  const imported = importDOCX(await readFile(pythonPath), schema);
  if (imported.report.fidelity !== 'bounded') throw new Error(`Independent DOCX import was unexpectedly ${imported.report.fidelity}.`);
  if (!imported.document.content.some((node) => node.type.name === 'image_super')) throw new Error('Independent DOCX image did not import.');
  if (!imported.document.content.some((node) => node.type.name === 'table')) throw new Error('Independent DOCX table did not import.');
  if (!imported.document.textContent.includes('Strong from Python')) throw new Error('Independent DOCX text did not import.');
  console.log('python-docx opened Fountain media and Fountain imported an independently generated image document.');
} finally {
  await rm(folder, { recursive: true, force: true });
}
