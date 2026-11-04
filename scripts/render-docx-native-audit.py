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
import xml.etree.ElementTree as ET


def run(args, destination, environment=None):
    result = subprocess.run(args, capture_output=True, text=True, timeout=120, env=environment)
    destination.write_text(result.stdout + result.stderr, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"Native tool exited {result.returncode}; inspect {destination}")
    return result.stdout


# This bounded fixture profile compares independent PDF coordinates, not our
# imported model or declarations. It is deliberately narrower than full layout.
PARAGRAPH_PHRASES = ["Experimental setup",
                  "Record the initial temperature before starting the timer.",
                  "Keep both probes at the same depth.",
                  "Read the measurements without moving either vessel."]
CAPTION_PHRASES = ["Figure 1 Probe positions in the two vessels",
                   "Figure 2 Cooling curves over thirty minutes"]
LAYOUT_PHRASES = PARAGRAPH_PHRASES + CAPTION_PHRASES


def paragraph_positions(pdf, destination, pdftotext, phrases=LAYOUT_PHRASES):
    bbox = run([str(pdftotext), "-bbox-layout", str(pdf), "-"], destination)
    document = ET.fromstring(bbox)
    pages = [item for item in document.iter() if item.tag.rsplit("}", 1)[-1] == "page"]
    if not pages:
        raise RuntimeError("No independently extracted PDF page coordinates.")
    words = [item for item in pages[0].iter() if item.tag.rsplit("}", 1)[-1] == "word"]
    text = ["".join(item.itertext()) for item in words]
    result = {}
    for phrase in phrases:
        target = phrase.split()
        indices = [index for index in range(len(text) - len(target) + 1)
                   if text[index:index + len(target)] == target]
        if len(indices) != 1:
            raise RuntimeError(f"Expected one first-page paragraph: {phrase}")
        first = words[indices[0]]
        result[phrase] = {"x": float(first.attrib["xMin"]), "y": float(first.attrib["yMin"])}
    return result


def position_deltas(source, exported, phrases=LAYOUT_PHRASES):
    return {phrase: {axis: exported[phrase][axis] - source[phrase][axis] for axis in ["x", "y"]}
            for phrase in phrases}


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
    coordinates = paragraph_positions(pdf, folder / "paragraph-bbox.txt", tools["pdftotext"])
    results[name] = {"pages": pages, "drawnImageObjects": image_count,
                     "paragraphPositions": coordinates,
                     "pdfSHA256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
                     "pageImages": [str(path.relative_to(root)) for path in captures]}
# A retained, actual pre-repair export must fail the coordinate profile. This
# catches a vacuous comparison without rewriting the independent source.
control = Path("artifacts/docx-native-spacing-native-evidence-20261104/unpacked/native")
control_positions = {name: paragraph_positions(control / name / f"{name}.pdf",
                    native / f"negative-control-{name}-bbox.txt", tools["pdftotext"], PARAGRAPH_PHRASES)
                    for name in ["source", "exported"]}
negative = position_deltas(control_positions["source"], control_positions["exported"], PARAGRAPH_PHRASES)
if not all(abs(delta["x"]) <= 0.01 and abs(delta["y"] - 7) <= 0.01 for delta in negative.values()):
    raise RuntimeError("The retained pre-repair PDF did not exhibit its known 7 pt offset.")

# A separate actual pre-image-layout export catches caption-only regressions;
# its paragraph defaults are already repaired, so it is a different control.
caption_control = Path("artifacts/docx-settings-gate-evidence-20261104/unpacked/native")
caption_positions = {name: paragraph_positions(caption_control / name / f"{name}.pdf",
                    native / f"caption-negative-control-{name}-bbox.txt", tools["pdftotext"], CAPTION_PHRASES)
                    for name in ["source", "exported"]}
caption_negative = position_deltas(caption_positions["source"], caption_positions["exported"], CAPTION_PHRASES)
for phrase, expected_y in zip(CAPTION_PHRASES, [-3.2, -6.4]):
    if abs(caption_negative[phrase]["x"]) > 0.01 or abs(caption_negative[phrase]["y"] - expected_y) > 0.01:
        raise RuntimeError("The retained image-layout control did not exhibit its known caption drift.")
deltas = position_deltas(results["source"]["paragraphPositions"], results["exported"]["paragraphPositions"])
layout_check = {"scope": LAYOUT_PHRASES, "tolerancePt": 0.01, "deltasPt": deltas,
                "negativeControl": {"retainedPreRepairPDF": str(control), "deltasPt": negative, "correctlyRejected": True},
                "captionNegativeControl": {"retainedPreRepairPDF": str(caption_control), "deltasPt": caption_negative, "correctlyRejected": True}}
(root / "paragraph-position-report.json").write_text(json.dumps(layout_check, indent=2) + "\n", encoding="utf-8")
if any(abs(value) > 0.01 for delta in deltas.values() for value in delta.values()):
    raise RuntimeError("Native paragraph position regression; inspect paragraph-position-report.json.")
summary = {"toolchain": versions, "rendered": results, "paragraphPositionCheck": layout_check,
           "sourceSHA256": interchange["sourceSHA256"], "exportedSHA256": interchange["exportedSHA256"],
           "status": "native render and required-content checks passed; visual comparison still requires inspection",
           "pixelFidelityCertified": False, "microsoftWordCertified": False,
           "sourceImportReport": "source-report.json", "actualBrowserConversionReport": "conversion-report.json",
           "interchangeReport": "interchange-report.json"}
(root / "native-report.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
