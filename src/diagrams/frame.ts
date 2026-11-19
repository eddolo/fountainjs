/** Trusted host assets are loaded in an opaque origin. Document source is sent as data after load. */
export function diagramFrame(owner: Document, scriptURL: string, bootstrap: string, title: string): HTMLIFrameElement {
  const url = new URL(scriptURL, owner.baseURI);
  if (!['https:', 'http:'].includes(url.protocol)) throw new TypeError('Serve the diagram script over HTTP or HTTPS.');
  const frame = owner.createElement('iframe');
  frame.title = title;
  frame.setAttribute('sandbox', 'allow-scripts');
  const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
  const policy = "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
  const library = owner.createElement('script');
  library.setAttribute('nonce', nonce);
  library.src = url.href;
  const bridge = owner.createElement('script');
  bridge.setAttribute('nonce', nonce);
  bridge.textContent = bootstrap;
  // Only trusted installation settings enter this HTML. Document data is sent after load.
  frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + policy + '"><body>' + library.outerHTML + bridge.outerHTML;
  return frame;
}
