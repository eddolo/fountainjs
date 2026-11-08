import * as Y from 'yjs';

export const SAFE_MAP_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;

export function defaultStructuredMapName(room: string): string {
  return `${room}:structured-attributes`;
}

export function retainedStructuredMap(document: Y.Doc, room: string): string | undefined {
  const metadata = document.share.get(`${room}:document`);
  const name = metadata instanceof Y.Map ? metadata.get('structuredMap') : undefined;
  if (name !== undefined && (typeof name !== 'string' || !SAFE_MAP_NAME.test(name)
    || !(document.share.get(name) instanceof Y.Map))) throw new Error('Invalid saved structured attribute map declaration.');
  return name;
}

export function declareRetainedStructuredMap(document: Y.Doc, room: string, name: string): void {
  if (name === defaultStructuredMapName(room)) return;
  if (!(document.share.get(name) instanceof Y.Map)) throw new Error('Room is missing the declared structured attribute map.');
  document.getMap(`${room}:document`).set('structuredMap', name);
}
