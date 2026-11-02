// Investigation only: reconstruct imported opaque HTML as source DATA.
// Never use this output as a reader/preview or assign it to innerHTML.
// This deliberately restores event attributes and raw script/style bodies.
// No production import/export policy or comparator is changed by this probe.
import { parseFragment, serialize } from 'parse5';

export function reconstructSource(fragment) {
  const root = parseFragment(fragment);
  const visit = node => {
    const attrs = new Map((node.attrs ?? []).map(attr => [attr.name, attr.value]));
    const mode = ['inline', 'block', 'raw-text'].find(kind => attrs.get(`data-fountain-inert-${kind}`) === 'v1');
    if (mode) {
      const data = JSON.parse(attrs.get('data-fountain-inert-data'));
      const body = node.childNodes.find(child => child.attrs?.some(attr => attr.name === 'data-fountain-inert-content' && attr.value === 'true'));
      if (!body || typeof data.tag !== 'string' || !/^[a-z][a-z0-9.-]*$/u.test(data.tag)) throw Error('Invalid prototype carrier');
      node.tagName = node.nodeName = data.tag;
      node.attrs = Object.entries(data.attributes).map(([name, value]) => ({ name, value }));
      node.childNodes = body.childNodes;
      for (const child of node.childNodes) child.parentNode = node;
      // HTML tree construction consumes one leading LF inside textarea.
      if (data.tag === 'textarea' && node.childNodes[0]?.value?.startsWith('\n')) node.childNodes[0].value = '\n' + node.childNodes[0].value;
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return serialize(root);
}
