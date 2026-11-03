"""Independent Linux CI office-rendering audit, not a Fountain fidelity oracle.

Inputs are the checked-in synthetic source and actual browser-downloaded export.
Never use this project CI harness to select a user's desktop Office installation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def run(args, destination, environment=None):
    result = subprocess.run(args, capture_output=True, text=True, timeout=120, env=environment)
    destination.write_text(result.stdout + result.stderr, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"Native tool exited {result.returncode}; inspect {destination}")
    return result.stdout


parser = argparse.ArgumentParser()
parser.add_argument("directory")
parser.add_argument("--soffice", required=True)
args = parser.parse_args()
if sys.platform != "linux":
    raise RuntimeError("This native office harness runs in isolated Linux CI, not against desktop Office.")
office = Path(args.soffice)
if not office.is_absolute() or not office.is_file():
    raise RuntimeError("Provide the absolute LibreOffice executable installed by this CI job.")
root = Path(args.directory).resolve(strict=True)
provenance = json.loads((root / "source-report.json").read_text(encoding="utf-8"))["provenance"]
interchange = json.loads((root / "interchange-report.json").read_text(encoding="utf-8"))
assert interchange["browser"]["actualDownload"] is True
assert interchange["browser"]["typingUndoRedo"] is True
tools = {name: Path("/usr/bin") / name for name in ["pdfinfo", "pdftotext", "pdftoppm", "pdfimages", "fc-match"]}
if not all(path.is_file() for path in tools.values()):
    raise RuntimeError("Install Poppler and fontconfig in the isolated Linux job first.")
native = root / "native"
native.mkdir(exist_ok=False)
versions = {"office": run([str(office), "--version"], native / "office-version.txt").strip(),
            "python": sys.version, "platform": sys.platform, "dpi": 120}
versions["fonts"] = {font: run([str(tools["fc-match"]), font], native / f"font-{font}.txt").strip()
                     for font in ["Arial", "Calibri", "Cambria", "Consolas"]}
results = {}
environment = dict(os.environ, SAL_USE_VCLPLUGIN="svp")
for name in ["source", "exported"]:
    folder = native / name
    folder.mkdir()
    profile = folder / "profile"
    profile.mkdir()
    source = root / f"{name}.docx"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == interchange[f"{name}SHA256"]
    run([str(office), f"-env:UserInstallation={profile.as_uri()}", "--headless", "--nologo", "--norestore",
         "--convert-to", "pdf:writer_pdf_Export", "--outdir", str(folder), str(source)], folder / "convert.log", environment)
    pdf = folder / f"{name}.pdf"
    if not pdf.is_file() or not pdf.read_bytes().startswith(b"%PDF-"):
        raise RuntimeError(f"LibreOffice did not produce a PDF for {name}; exit zero alone is insufficient.")
    info = run([str(tools["pdfinfo"]), "-box", str(pdf)], folder / "pdfinfo.txt")
    page_match = re.search(r"^Pages:\s+(\d+)\s*$", info, re.MULTILINE)
    if not page_match:
        raise RuntimeError(f"No independently readable page count for {name}.")
    pages = int(page_match.group(1))
    run([str(tools["pdftotext"]), "-layout", str(pdf), str(folder / "text.txt")], folder / "text.log")
    text = re.sub(r"\s+", " ", (folder / "text.txt").read_text(encoding="utf-8"))
    for marker in provenance["requiredText"]:
        if marker not in text:
            raise RuntimeError(f"Native {name} lost required visible content: {marker}")
    if name == "exported" and "END OF REPORT Checked in Fountain." not in text:
        raise RuntimeError("The actual browser edit is missing from the native exported PDF.")
    images = run([str(tools["pdfimages"]), "-list", str(pdf)], folder / "images.txt")
    image_count = len(re.findall(r"^\s*\d+\s+\d+\s+image\s", images, re.MULTILINE))
    if image_count < provenance["expected"]["bodyImages"]:
        raise RuntimeError(f"Native {name} has fewer drawn image objects than the two body figures.")
    run([str(tools["pdftoppm"]), "-png", "-r", "120", str(pdf), str(folder / "page")], folder / "raster.log")
    captures = sorted(folder.glob("page-*.png"))
    if len(captures) != pages or not all(path.stat().st_size > 0 for path in captures):
        raise RuntimeError(f"Incomplete native page images for {name}.")
    results[name] = {"pages": pages, "drawnImageObjects": image_count,
                     "pdfSHA256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
                     "pageImages": [str(path.relative_to(root)) for path in captures]}
summary = {"toolchain": versions, "rendered": results,
           "sourceSHA256": interchange["sourceSHA256"], "exportedSHA256": interchange["exportedSHA256"],
           "status": "native render and required-content checks passed; visual comparison still requires inspection",
           "pixelFidelityCertified": False, "microsoftWordCertified": False,
           "sourceImportReport": "source-report.json", "actualBrowserConversionReport": "conversion-report.json",
           "interchangeReport": "interchange-report.json"}
(root / "native-report.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
