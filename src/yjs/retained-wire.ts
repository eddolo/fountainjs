import * as Y from 'yjs';

/** Yjs writes these fields as UTF-8, which cannot retain unpaired UTF-16 units. */
export function assertRetainedWireString(value: string): void {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) throw new Error('Retained wire data contains unpaired UTF-16; source was not normalized.');
}

/** Check the actual stored runs, not concatenated text that can hide two bad halves. */
export function assertRetainedWireData(document: Y.Doc): void {
  const seen = new WeakSet<object>();
  const any = (value: unknown): void => {
    if (typeof value === 'string') { assertRetainedWireString(value); return; }
    if (typeof value === 'bigint') {
      if (BigInt.asIntN(64, value) !== value) throw new Error('Retained wire Any bigint exceeds signed 64-bit storage.');
      return;
    }
    if (typeof value === 'function' || typeof value === 'symbol') throw new Error('Retained wire Any contains runtime behavior.');
    if (!value || typeof value !== 'object' || value instanceof Uint8Array || seen.has(value)) return;
    seen.add(value);
    // relativePositionToJSON retains standard Y.ID records inside its JSON.
    if (Object.getOwnPropertySymbols(value).length || ![Object.prototype, null, Array.prototype, Y.ID.prototype].includes(Object.getPrototypeOf(value))) throw new Error('Retained wire Any needs plain data.');
    const entries = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) throw new Error('Retained wire Any needs a dense array.');
    }
    for (const [key, descriptor] of Object.entries(entries)) {
      if (Array.isArray(value) && key === 'length') continue;
      if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Retained wire Any needs enumerable data fields.');
      assertRetainedWireString(key); any(descriptor.value);
    }
  };
  for (const name of document.share.keys()) assertRetainedWireString(name);
  for (const structs of document.store.clients.values()) for (const struct of structs) if (struct instanceof Y.Item) {
    if (struct.parentSub !== null) assertRetainedWireString(struct.parentSub);
    const content = struct.content;
    if (content instanceof Y.ContentString) assertRetainedWireString(content.str);
    else if (content instanceof Y.ContentAny) for (const value of content.arr) any(value);
    // Format/embed/JSON payloads use JSON encoding and retain escaped units.
    else if (content instanceof Y.ContentFormat) assertRetainedWireString(content.key);
    else if (content instanceof Y.ContentType) {
      if (content.type instanceof Y.XmlElement) assertRetainedWireString(content.type.nodeName);
      else if (content.type instanceof Y.XmlHook) assertRetainedWireString(content.type.hookName);
    } else if (!(content instanceof Y.ContentDeleted) && content.getContent()[0] instanceof Y.Doc) {
      // Older supported Yjs releases expose the stored document without exporting ContentDoc.
      throw new Error('Retained checkpoint does not include subdocument state.');
    }
  }
}
