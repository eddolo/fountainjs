// Only the bundled viewer script runs here. BPMN XML is passed to its document importer.
window.addEventListener('message', async event => {
  if (event.source !== parent || typeof event.data?.xml !== 'string') return;
  const style = document.createElement('style');
  style.textContent = (event.data.styleText || '') + '\nhtml, body { height:100%; margin:0; font:14px system-ui; } body { display:flex; flex-direction:column; } main { flex:1; min-height:0; } details, [role=alert] { padding:.5rem; max-height:6rem; overflow:auto; }';
  document.head.append(style);
  const canvas = document.body.appendChild(document.createElement('main'));
  canvas.setAttribute('aria-label', 'Process drawing');
  try {
    const viewer = new BpmnJS({ container: canvas });
    const { warnings } = await viewer.importXML(event.data.xml);
    const drawing = viewer.get('canvas');
    const fit = () => {
      const fitted = drawing.zoom('fit-viewport', 'auto');
      drawing.zoom(fitted * 0.92, 'auto');
    };
    if (warnings.length) {
      const details = document.body.appendChild(document.createElement('details'));
      details.appendChild(document.createElement('summary')).textContent = 'Viewer warnings (' + warnings.length + ')';
      for (const warning of warnings) details.appendChild(document.createElement('p')).textContent = warning.message;
    }
    fit();
    new ResizeObserver(fit).observe(canvas);
  } catch (error) {
    const alert = document.body.appendChild(document.createElement('p'));
    alert.setAttribute('role', 'alert');
    alert.textContent = 'BPMN preview unavailable. ' + String(error.message || error).slice(0, 350);
  }
}, { once: true });
