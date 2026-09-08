import type { Node, Schema } from '../schema';

interface ElementLike {
  readonly tagName: string;
  readonly childNodes: ArrayLike<{ readonly textContent: string | null }>;
}

/** Shared DOM/server structural projection; never guesses over unrelated content. */
export function importDefinitionList<T extends ElementLike>(
  element: T, schema: Schema, readBlocks: (element: T) => Node[],
  readRegisteredItem: (element: T) => Node | null = () => null, onGroupRemoved: () => void = () => {},
): Node | null {
  if (!schema.nodes.definition_list || !schema.nodes.definition_term || !schema.nodes.definition_description) return null;
  const items: Node[] = [];
  let groups = 0;
  const visit = (parent: T): boolean => Array.from(parent.childNodes).every(child => {
    if ('nodeType' in child && child.nodeType === 8) return true;
    const tag = 'tagName' in child ? String(child.tagName).toLowerCase() : '';
    if (!tag) return !child.textContent?.trim();
    if (tag === 'script' || tag === 'template') return true;
    if (tag === 'div') { groups += 1; return visit(child as unknown as T); }
    if (tag !== 'dt' && tag !== 'dd') return false;
    const registered = readRegisteredItem(child as unknown as T);
    if (registered) { items.push(registered); return true; }
    const blocks = readBlocks(child as unknown as T);
    items.push(schema.node(tag === 'dt' ? 'definition_term' : 'definition_description', {},
      blocks.length ? blocks : [schema.node('paragraph', {}, [schema.text('')])]));
    return true;
  });
  try {
    if (!visit(element)) return null;
    const result = schema.node('definition_list', {}, items);
    schema.validate(result);
    if (groups) onGroupRemoved();
    return result;
  } catch { return null; }
}
