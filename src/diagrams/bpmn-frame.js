// Only the bundled viewer script runs here. BPMN XML is passed to its document importer.
window.addEventListener('message', async event => {
  if (event.source !== parent || typeof event.data?.xml !== 'string') return;
  const port = event.ports[0];
  const style = document.createElement('style');
  style.textContent = (event.data.styleText || '') + `
    html, body { height:100%; margin:0; font:14px system-ui; }
    body { display:flex; flex-direction:column; }
    main { flex:1; min-height:0; }
    label { display:flex; align-items:center; gap:.5rem; padding:.4rem .6rem; }
    select { min-width:0; max-width:100%; font:inherit; }
    details, [role=alert] { padding:.5rem; max-height:6rem; overflow:auto; }`;
  document.head.append(style);
  const canvas = document.body.appendChild(document.createElement('main'));
  canvas.setAttribute('aria-label', 'Process drawing');
  const messages = document.body.appendChild(document.createElement('div'));

  function showError(error) {
    port?.postMessage({ type: 'error', message: 'This drawing could not be opened. Choose another drawing or edit the XML.' });
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.textContent = 'BPMN preview unavailable. ' + String(error.message || error).slice(0, 350);
    messages.replaceChildren(alert);
  }

  function showWarnings(warnings) {
    messages.replaceChildren();
    if (!warnings.length) return;
    const details = messages.appendChild(document.createElement('details'));
    details.appendChild(document.createElement('summary')).textContent = 'Viewer warnings (' + warnings.length + ')';
    for (const warning of warnings) details.appendChild(document.createElement('p')).textContent = warning.message;
  }

  try {
    const viewer = new BpmnJS({ container: canvas });
    const drawing = viewer.get('canvas');
    let baseline;
    let unsafeToSave = false;
    // The modeler can silently omit XML comments and processing instructions.
    function metadata(xml) {
      const tree = new DOMParser().parseFromString(xml, 'application/xml');
      const walker = tree.createTreeWalker(tree, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_DOCUMENT_TYPE);
      const values = [];
      while (walker.nextNode()) values.push(new XMLSerializer().serializeToString(walker.currentNode));
      return JSON.stringify(values);
    }
    async function enableEditing(warnings) {
      if (!port) return;
      if (warnings.length) {
        unsafeToSave = true;
        port.postMessage({ type: 'error', message: 'The modeler reported import warnings. Edit the XML source to preserve unsupported content.' });
      }
      if (unsafeToSave) return;
      if (baseline === undefined) {
        baseline = (await viewer.saveXML({ format: false })).xml;
        if (metadata(event.data.xml) !== metadata(baseline)) {
          unsafeToSave = true;
          port.postMessage({ type: 'error', message: 'The modeler would change XML comments, processing instructions or the document type. Use the XML editor to retain them.' });
          return;
        }
      }
      port.postMessage({ type: 'ready' });
    }
    if (port) port.onmessage = async ({ data }) => {
      if (data !== 'save' || unsafeToSave || !ready) return;
      try {
        const { xml } = await viewer.saveXML({ format: false });
        const original = event.data.xml;
        let output = xml;
        if (original.includes('\r\n') && !original.replaceAll('\r\n', '').includes('\n')) output = output.replace(/\r?\n/g, '\r\n');
        if (original.startsWith('\uFEFF') && !output.startsWith('\uFEFF')) output = '\uFEFF' + output;
        port.postMessage({ type: 'save', xml: xml === baseline ? original : output });
      } catch (error) {
        port.postMessage({ type: 'error', message: String(error.message || error) });
      }
    };
    let ready = false;
    let fileWarnings = [];
    viewer.on('import.parse.complete', event => { fileWarnings = event.warnings || []; });
    const fit = () => {
      if (!ready || !canvas.clientWidth || !canvas.clientHeight) return;
      const fitted = drawing.zoom('fit-viewport', 'auto');
      drawing.zoom(fitted * 0.92, 'auto');
    };
    try {
      const result = await viewer.importXML(event.data.xml);
      ready = true;
      showWarnings(result.warnings);
      await enableEditing(result.warnings);
    } catch (error) {
      showError(error);
    }

    // A valid definitions tree may contain a broken first drawing and usable siblings.
    const diagrams = viewer.getDefinitions()?.diagrams || [];
    if (diagrams.length > 1) {
      const label = document.createElement('label');
      label.textContent = 'Diagram';
      const select = label.appendChild(document.createElement('select'));
      diagrams.forEach((diagram, index) => {
        const title = diagram.name || diagram.plane?.bpmnElement?.name || diagram.id || 'Untitled';
        select.add(new Option((index + 1) + '. ' + title, String(index)));
      });
      canvas.before(label);
      let opening = false;
      select.addEventListener('change', async () => {
        if (opening) return;
        opening = true;
        let index;
        do {
          index = select.selectedIndex;
          ready = false;
          try {
            const result = await viewer.open(diagrams[index]);
            ready = true;
            const warnings = [...fileWarnings, ...result.warnings];
            showWarnings(warnings);
            await enableEditing(warnings);
            fit();
          } catch (error) {
            showError(error);
          }
        } while (select.selectedIndex !== index);
        opening = false;
      });
    }
    fit();
    new ResizeObserver(fit).observe(canvas);
  } catch (error) {
    showError(error);
  }
}, { once: true });
