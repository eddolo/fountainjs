"""Select diagnostic cases not passed in the interrupted broad run.

This is an iteration aid. It does not establish a clean full-matrix release run.
"""
from pathlib import Path
import posixpath
import re

source = Path('artifacts/release-browser-597f5415.log').read_text(encoding='utf-8')
pattern = re.compile(r'^\s+ok\s+\d+\s+\[([^]]+)\]\s+›\s+(.*?\.spec\.ts):\d+:\d+\s+›\s+(.*?)\s+\([\d.]+(?:ms|s|m)\)\s*$', re.MULTILINE)
entries = []
for project, filename, title in pattern.findall(source):
    filename = posixpath.relpath(filename.replace('\\', '/'), 'tests/browser')
    entries.append(f'[{project}] › {filename} › {title}')
assert len(entries) == 628, f'Expected 628 recorded passes, found {len(entries)}.'
assert len(set(entries)) == len(entries), 'Duplicate pass identities need review.'
target = Path('artifacts/browser-passed-before-widget-fix-20261111.txt')
target.write_text('\n'.join(entries) + '\n', encoding='utf-8')
print(f'Recorded {len(entries)} previous-pass identities in {target}.')
