from pathlib import Path
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parents[1]
folder = root / 'artifacts/cross-container-tarball-20261105'
archive = folder / 'fountainjs-editor-0.4.0-beta.2.tgz'
target = folder / 'consumer/node_modules/fountainjs-editor'
count = 0
with tarfile.open(archive, 'r:gz') as package:
    for member in package:
        if not member.isfile():
            continue
        path = Path(member.name)
        assert path.parts[0] == 'package' and '..' not in path.parts and not path.is_absolute(), member.name
        relative = Path(*path.parts[1:])
        data = package.extractfile(member).read()
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        if relative.parts[0] == 'dist':
            assert data == (root / relative).read_bytes(), relative
            count += 1
# A separate package scope is essential: otherwise Node's self-reference resolves
# the enclosing repository package before searching this consumer's node_modules.
(folder / 'consumer/package.json').write_bytes(b'{"name":"fountain-cross-container-audit","private":true,"type":"module"}\n')
(folder / 'consumer/probe.mjs').write_bytes((root / 'artifacts/cross-container-packed-probe-20261105.mjs').read_bytes())
report = dict(archive=archive.relative_to(root).as_posix(), sha256=hashlib.sha256(archive.read_bytes()).hexdigest(), distFilesMatch=count)
(root / 'artifacts/cross-container-package-20261105.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps(report))
