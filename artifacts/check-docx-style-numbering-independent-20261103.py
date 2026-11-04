import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
from docx import Document

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
source = Path('artifacts/docx-style-numbering-source-20261103/runbook.docx')
assert len(Document(source).paragraphs) == 9
results = []
for engine in ['chromium', 'firefox', 'webkit']:
    path = Path('artifacts/docx-style-numbering-measured-real-20261103') / engine / 'runbook-export.docx'
    doc = Document(path)
    assert len(doc.paragraphs) == 9
    assert doc.paragraphs[-1].text == 'Audit complete. Verified in Fountain.'
    with ZipFile(path) as package:
        numbering = ET.fromstring(package.read('word/numbering.xml'))
        document = ET.fromstring(package.read('word/document.xml'))
    abstracts = {node.get(W + 'abstractNumId'): node for node in numbering.findall(W + 'abstractNum')}
    instances = {node.get(W + 'numId'): node.find(W + 'abstractNumId').get(W + 'val') for node in numbering.findall(W + 'num')}
    marked = []
    for paragraph in document.find(W + 'body').findall(W + 'p'):
        text = ''.join(node.text or '' for node in paragraph.iter(W + 't'))
        properties = paragraph.find(W + 'pPr/' + W + 'numPr')
        if properties is None:
            assert text not in ['Verify the inlet pressure.', 'Record the outlet temperature.', 'Wear eye protection.', 'Keep the bypass closed.']
            continue
        identity = properties.find(W + 'numId').get(W + 'val')
        index = properties.find(W + 'ilvl').get(W + 'val')
        level = abstracts[instances[identity]].find(W + 'lvl[@' + W + 'ilvl="' + index + '"]')
        marked.append((text, level.find(W + 'numFmt').get(W + 'val'), int(level.find(W + 'start').get(W + 'val'))))
    assert marked == [
        ('Verify the inlet pressure.', 'decimal', 3),
        ('Record the outlet temperature.', 'decimal', 3),
        ('Wear eye protection.', 'bullet', 1),
        ('Keep the bypass closed.', 'bullet', 1),
    ], marked
    results.append({'engine': engine, 'pythonDocxParagraphs': 9, 'nativeNumbering': marked})
Path('artifacts/docx-style-numbering-independent-20261103.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
print('Independent python-docx loading and direct OOXML references confirm starts, list types and removed numbering in all three actual downloads.')
