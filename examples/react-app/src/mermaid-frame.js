// This script runs inside the opaque-origin layout frame.
let serial = 0;
window.addEventListener('message', async event => {
  if (event.source !== parent || !event.ports[0] || typeof event.data !== 'string') return;
  const port = event.ports[0];
  const container = document.body.appendChild(document.createElement('div'));
  try {
    if (!serial) mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
      flowchart: { htmlLabels: false }, suppressErrorRendering: true,
      secure: ['secure', 'securityLevel', 'startOnLoad', 'htmlLabels', 'flowchart', 'maxEdges', 'maxTextSize'],
    });
    const { svg } = await mermaid.render('fountain-diagram-' + ++serial, event.data, container);
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    const size = root.viewBox.baseVal;
    if (size.width > 0 && size.height > 0) {
      root.setAttribute('width', String(size.width));
      root.setAttribute('height', String(size.height));
    }
    port.postMessage({ svg: new XMLSerializer().serializeToString(root), title: root.querySelector('title')?.textContent });
  } catch (error) {
    port.postMessage({ error: String(error.message || error).slice(0, 350) });
  } finally {
    container.remove();
    port.close();
  }
});
