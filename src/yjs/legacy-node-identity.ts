import * as Y from 'yjs';

export function legacyNodeIdentity(node: Y.XmlElement): string {
  const reference = Y.createRelativePositionFromTypeIndex(node, 0).type;
  if (!reference) throw new Error('Legacy node has no stable shared identity.');
  return `yjs-${reference.client}-${reference.clock}`;
}
