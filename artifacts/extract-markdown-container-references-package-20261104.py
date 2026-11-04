from pathlib import Path
import tarfile

base = Path('artifacts/markdown-container-references-tarball-20261104')
archive = base / 'fountainjs-editor-0.4.0-beta.2.tgz'
consumer = base / 'consumer'
target = (consumer / 'node_modules/fountainjs-editor').resolve()
target.mkdir(parents=True, exist_ok=True)
with tarfile.open(archive, 'r:gz') as package:
    for member in package:
        if not member.name.startswith('package/') or member.issym() or member.islnk():
            raise ValueError('Unexpected package entry: ' + member.name)
        if not member.isfile():
            continue
        destination = (target / member.name.removeprefix('package/')).resolve()
        if not destination.is_relative_to(target):
            raise ValueError('Package path escapes consumer')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(package.extractfile(member).read())
(consumer / 'package.json').write_bytes(b'{"type":"module","private":true}\n')
(consumer / 'probe.mjs').write_bytes(Path('artifacts/markdown-container-references-packed-probe-20261104.mjs').read_bytes())
print(str(target))
