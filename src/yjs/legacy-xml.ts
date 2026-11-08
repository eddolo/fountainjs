import * as Y from 'yjs';
import type { NodeJSON } from '../core/schema';

export const ELEMENT_NAME = 'fountain-node';
export const TYPE_ATTRIBUTE = 'fountain:type';
export const MARKS_ATTRIBUTE = 'fountain:marks';
export const ATTRIBUTE_PREFIX = 'fountain:attr:';
export const MAXIMUM_ATTRIBUTE_LENGTH = 1_000_000;

export type SharedElement = Y.XmlElement<Record<string, any>>;
type VisitSharedItem = (item: SharedElement | Y.XmlText, path: readonly number[]) => void;

export function isSharedElement(value: unknown): value is SharedElement {
  return value instanceof Y.XmlElement && value.nodeName === ELEMENT_NAME;
}

export function validAttributeName(value: string): boolean {
  return /^[a-z_][\w.-]{0,127}$/i.test(value)
    && value !== '__proto__'
    && value !== 'prototype'
    && value !== 'constructor';
}

function decodeAttribute(value: unknown, label: string): unknown {
  if (typeof value !== 'string' || value.length > MAXIMUM_ATTRIBUTE_LENGTH) {
    throw new Error(`Invalid collaborative ${label}.`);
  }
  try { return JSON.parse(value); }
  catch { throw new Error(`Invalid JSON in collaborative ${label}.`); }
}

/** Checkpoint decoding also indexes native identities and rejects XML data
 * that the live decoder's established projection omits. */
export function readLegacyXmlRoot(root: SharedElement, visitCheckpointItem?: VisitSharedItem): NodeJSON {
  let nodes = 0;
  let characters = 0;

  function read(element: SharedElement, depth: number, path?: readonly number[]): NodeJSON {
    if (depth > 100 || ++nodes > 100_000) throw new Error('Document too large.');
    const attributes = element.getAttributes();
    if (Object.keys(attributes).length > 1_000) throw new Error('Too many collaborative attributes.');
    const type = attributes[TYPE_ATTRIBUTE];
    if (typeof type !== 'string' || !type) throw new Error('Collaborative node needs a type.');
    const attrs: Record<string, unknown> = {};
    let marks: NodeJSON['marks'];
    for (const [name, value] of Object.entries(attributes)) {
      if (name === TYPE_ATTRIBUTE) continue;
      if (name === MARKS_ATTRIBUTE) {
        const parsed = decodeAttribute(value, 'marks');
        if (!Array.isArray(parsed)) throw new Error('Collaborative marks must be an array.');
        marks = parsed;
        continue;
      }
      if (!name.startsWith(ATTRIBUTE_PREFIX) || name.length === ATTRIBUTE_PREFIX.length) {
        throw new Error(`Unknown collaborative node metadata: ${name}`);
      }
      const attributeName = name.slice(ATTRIBUTE_PREFIX.length);
      if (!validAttributeName(attributeName)) throw new Error(`Invalid collaborative attribute name: ${attributeName}`);
      attrs[attributeName] = decodeAttribute(value, `attribute ${attributeName}`);
    }

    if (path) visitCheckpointItem!(element, path);
    const children = element.toArray();
    if (type === 'text') {
      const [shared] = children;
      if (children.length !== 1 || !(shared instanceof Y.XmlText)) throw new Error('Invalid collaborative text node.');
      if (path) {
        if (Object.keys(attrs).length || Object.keys(shared.getAttributes()).length
          || shared.toDelta().some((run: { insert: unknown; attributes?: object }) => typeof run.insert !== 'string'
            || run.attributes && Object.keys(run.attributes).length)) {
          throw new Error('Unsupported legacy text attributes, formatting or embeds.');
        }
        visitCheckpointItem!(shared, path);
      }
      const text = shared.toString();
      characters += text.length;
      if (characters > 10_000_000) throw new Error('Collaborative text is too long.');
      return { type, text, ...(marks?.length ? { marks } : {}) };
    }

    const content = children.map((child, index) => {
      if (!isSharedElement(child)) throw new Error('Invalid collaborative child.');
      return read(child, depth + 1, path && [...path, index]);
    });
    return { type, ...(Object.keys(attrs).length ? { attrs } : {}), ...(marks?.length ? { marks } : {}),
      ...(content.length ? { content } : {}) };
  }

  return read(root, 0, visitCheckpointItem ? [] : undefined);
}
