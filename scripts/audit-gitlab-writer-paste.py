"""Paste the live X11 clipboard into Writer and inspect the saved document."""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import uno
from PIL import ImageGrab
from com.sun.star.beans import PropertyValue
from com.sun.star.connection import NoConnectException


def property_value(name, value):
    prop = PropertyValue()
    prop.Name, prop.Value = name, value
    return prop


def private_display():
    display = os.environ.get("DISPLAY", "")
    match = re.fullmatch(r":(\d+)(?:\.\d+)?", display)
    if not match:
        raise RuntimeError("Use xvfb-run for the isolated clipboard test")
    pid = int(Path(f"/tmp/.X{match[1]}-lock").read_text().strip())
    if Path(f"/proc/{pid}/comm").read_text().strip() != "Xvfb":
        raise RuntimeError("The clipboard test requires an Xvfb display")
    return display


def connect(process, pipe):
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
    deadline = time.monotonic() + 30
    while process.poll() is None and time.monotonic() < deadline:
        try:
            return resolver.resolve(f"uno:pipe,name={pipe};urp;StarOffice.ComponentContext")
        except NoConnectException:
            time.sleep(0.15)
    raise RuntimeError("Writer did not open its private automation connection")


def table_content(doc):
    tables = doc.getTextTables()
    if tables.Count != 1:
        return {"count": tables.Count, "rows": None, "boldOwner": False, "runbookURL": None}
    table = tables.getByIndex(0)
    rows = {}
    bold_owner = False
    link = None
    for name in table.getCellNames():
        cell = table.getCellByName(name)
        rows[name] = cell.String
        paragraphs = cell.createEnumeration()
        while paragraphs.hasMoreElements():
            runs = paragraphs.nextElement().createEnumeration()
            while runs.hasMoreElements():
                run = runs.nextElement()
                if "owner" in run.String and run.CharWeight >= 150:
                    bold_owner = True
                if run.String == "Runbook":
                    link = run.HyperLinkURL
    return {"count": 1, "rows": rows, "boldOwner": bold_owner, "runbookURL": link}


def capture_reopened_page(display, destination, has_text):
    # The model can be ready while the Writer window still shows its grey canvas.
    deadline = time.monotonic() + 15
    previous = None
    while time.monotonic() < deadline:
        screen = ImageGrab.grab(xdisplay=display)
        width, height = screen.size
        page = screen.crop((width // 6, height // 7, width * 5 // 6, height * 2 // 3)).convert("L")
        levels = page.histogram()
        page_visible = levels[255] > page.width * page.height // 4
        text_visible = sum(levels[:96]) > 30
        if page_visible and (text_visible or not has_text):
            pixels = page.tobytes()
            if pixels == previous:
                screen.save(destination)
                return
            previous = pixels
        else:
            previous = None
        time.sleep(0.2)
    screen.save(destination)
    raise RuntimeError("The reopened Writer page did not finish painting on the private display")


def paste_into_writer(directory):
    display = private_display()
    version = subprocess.check_output(["soffice", "--version"], text=True).strip()
    with tempfile.TemporaryDirectory(prefix="fountain-writer-") as profile:
        pipe = "fountain_" + uuid.uuid4().hex
        process = subprocess.Popen(["soffice", "-env:UserInstallation=" + Path(profile).as_uri(),
            "--nologo", "--norestore", "--nodefault", "--nofirststartwizard",
            f"--accept=pipe,name={pipe};urp;StarOffice.ServiceManager"],
            env={**os.environ, "SAL_USE_VCLPLUGIN": "gen"}, stdout=subprocess.DEVNULL, stderr=sys.stderr)
        desktop = None
        try:
            ctx = connect(process, pipe)
            desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
            dispatch = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.DispatchHelper", ctx)
            doc = desktop.loadComponentFromURL("private:factory/swriter", "_blank", 0, ())
            frame = doc.CurrentController.Frame
            frame.ContainerWindow.toFront()
            dispatch.executeDispatch(frame, ".uno:Paste", "", 0, ())
            pasted = table_content(doc)
            url = (directory / "writer-paste.odt").as_uri()
            doc.storeAsURL(url, (property_value("FilterName", "writer8"),))
            doc.close(True)
            saved = desktop.loadComponentFromURL(url, "_blank", 0, (property_value("ReadOnly", True),))
            reopened = table_content(saved)
            saved.CurrentController.Frame.ContainerWindow.toFront()
            # Capture the application after Writer has laid out the reopened document.
            saved.CurrentController.getViewCursor().gotoStart(False)
            capture_reopened_page(display, directory / "writer-reopened.png", bool(reopened["rows"]))
            saved.close(True)
            prefix = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
            with ZipFile(directory / "writer-paste.odt") as archive:
                root = ET.fromstring(archive.read("content.xml"))
                table = root.find(".//" + prefix + "table")
                row = table.find(".//" + prefix + "table-row") if table is not None else None
                first = row.find(prefix + "table-cell") if row is not None else None
                span = int(first.get(prefix + "number-columns-spanned", "1")) if first is not None else None
                header = table is not None and table.find(prefix + "table-header-rows") is not None
            return {"version": version, "pasted": pasted, "reopened": reopened,
                    "firstCellColspan": span, "repeatingHeaderRows": header}
        finally:
            if desktop is not None:
                desktop.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=5)


if __name__ == "__main__":
    print(json.dumps(paste_into_writer(Path(sys.argv[1]).resolve())))
