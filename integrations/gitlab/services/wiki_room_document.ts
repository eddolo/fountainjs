import type { Attributes, MarkJSON, Node, NodeJSON, Schema } from 'fountainjs-editor';
import type * as Y from 'yjs';

// Use the host's Yjs constructors. The GitLab runtime and the Fountain bundle
// can be built separately and a second Yjs installation has different identities.
type XmlTypes = Pick<typeof Y, 'XmlText' | 'XmlElement'>;
const nodes = new Map(Object.entries({
  paragraph:'paragraph', heading:'heading', blockquote:'blockquote', bulletList:'bullet_list',
  orderedList:'ordered_list', listItem:'list_item', hardBreak:'hard_break', horizontalRule:'horizontal_rule',
}));
const marks = new Map(Object.entries({
  bold:'strong', italic:'em', strike:'strike', code:'code', subscript:'subscript', superscript:'superscript',
}));
const reverse = (table: Map<string,string>) => new Map([...table].map(([stock,native]) => [native,stock]));
const stockNodes = reverse(nodes), stockMarks = reverse(marks);

function unsupported(path: readonly number[], value: string): never {
  throw new Error('Unsupported GitLab wiki room content at ' + (path.join('.') || 'root') + ': ' + value);
}

function stockAttrs(type: string, attrs: Attributes, path: readonly number[]): Attributes {
  const result: Attributes = {};
  for (const [key,value] of Object.entries(attrs)) {
    if ((type === 'heading' && key === 'level') || (type === 'orderedList' && key === 'start')) result[key] = value;
    else if (!(type === 'blockquote' && key === 'multiline' && value === false)
      && !(type === 'orderedList' && ((key === 'parens' && value === false) || (key === 'type' && value === null)))
      && !(type === 'bulletList' && key === 'bullet' && value === '*')) unsupported(path, type + '.' + key);
  }
  return result;
}

/** Decode the existing stock fragment without creating, seeding or repairing Yjs types. */
export function readGitLabWikiRoom(fragment: Y.XmlFragment, schema: Schema, types: XmlTypes): Node {
  let count = 0;
  function children(parent: Y.XmlFragment, path: readonly number[]): NodeJSON[] {
    const content: NodeJSON[] = [];
    for (const [index,child] of parent.toArray().entries()) {
      const childPath = [...path,index];
      if (++count > 100000 || childPath.length > 100) unsupported(childPath, 'document bounds');
      if (child instanceof types.XmlText) {
        if (Object.keys(child.getAttributes()).length) unsupported(childPath, 'text attributes');
        for (const span of child.toDelta()) {
          if (typeof span.insert !== 'string' || !span.insert.length) unsupported(childPath, 'text embed or empty span');
          const formatting: MarkJSON[] = [];
          for (const [name,attrs] of Object.entries(span.attributes ?? {})) {
            const type = marks.get(name);
            if (!type || !attrs || typeof attrs !== 'object' || Array.isArray(attrs) || Object.keys(attrs).length)
              unsupported(childPath, name);
            formatting.push({type});
          }
          content.push({type:'text',text:span.insert,marks:formatting});
        }
      } else if (child instanceof types.XmlElement && nodes.has(child.nodeName)) {
        content.push({type:nodes.get(child.nodeName)!, attrs:stockAttrs(child.nodeName,child.getAttributes(),childPath),
          content:children(child,childPath)});
      } else unsupported(childPath, child instanceof types.XmlElement ? child.nodeName : 'XML type');
    }
    return content;
  }
  return schema.nodeFromJSON({type:'doc',content:children(fragment,[])});
}

export interface GitLabWikiWire<StockNode> {
  types: XmlTypes;
  stockSchema: { nodeFromJSON(json: NodeJSON): StockNode };
  updateYFragment(doc: Y.Doc, fragment: Y.XmlFragment, node: StockNode,
    meta: { mapping: Map<any, any>; isOMark: Map<any, boolean> }): void;
}

type StockWikiNode = { check(): void; toJSON(): NodeJSON };

function prepareStockNode<T extends StockWikiNode>(document: Node, wire: GitLabWikiWire<T>): T {
  const native = document.type.schema;
  const prepared = wire.stockSchema.nodeFromJSON(toGitLabWikiJSON(document));
  prepared.check();
  // A stock schema can accept JSON while silently discarding unknown attributes.
  // Validate the actual stock projection before touching the live fragment.
  function project(node: NodeJSON, path: readonly number[]): NodeJSON {
    const type = node.type === 'doc' || node.type === 'text' ? node.type : nodes.get(node.type);
    if (!type) unsupported(path,node.type);
    const formatting = node.marks?.map(mark => {
      const name = marks.get(mark.type);
      if (!name || Object.keys(mark.attrs ?? {}).length) unsupported(path,mark.type);
      return {type:name};
    });
    return {type,attrs:stockAttrs(node.type,node.attrs ?? {},path),text:node.text,marks:formatting,
      content:node.content?.map((child,index) => project(child,[...path,index]))};
  }
  if (!native.nodeFromJSON(project(prepared.toJSON(),[])).eq(document))
    throw new Error('The stock wiki schema cannot retain this Fountain document.');
  return prepared;
}

/** Bind an already synchronized fragment. GitLab owns transport, seeding and room lifetime. */
export function bindGitLabWikiDocument<StockNode extends StockWikiNode>(
  fragment: Y.XmlFragment, schema: Schema, wire: GitLabWikiWire<StockNode>,
) {
  const doc = fragment.doc;
  if (!doc || !Object.is(doc.share.get('default'), fragment)) throw new Error('Expected the attached GitLab default wiki fragment.');
  const read = () => readGitLabWikiRoom(fragment, schema, wire.types);
  let lastProjection: {doc: Node; stock: StockNode} | undefined;
  function prepare(before: Node, after: Node) {
    if (before.type.schema !== schema || after.type.schema !== schema || !read().eq(before))
      throw new Error('The GitLab wiki draft changed. Read the current room before applying an edit.');
    if (lastProjection?.doc !== after) lastProjection = {doc:after,stock:prepareStockNode(after,wire)};
    return lastProjection.stock;
  }
  return {
    read, prepare,
    apply(before: Node, after: Node, origin: object): void {
      const stockNode = prepare(before,after);
      if (before.eq(after)) return;
      // GitLab's normal binding reconciles XML children and text in place. A new
      // mapping reflects remote changes since the previous local operation.
      doc.transact(() => wire.updateYFragment(doc, fragment, stockNode, {mapping:new Map(), isOMark:new Map()}), origin);
    },
  };
}

export interface GitLabWikiProvider {
  readonly doc: Y.Doc;
  readonly whenSynced: Promise<{seed: boolean}>;
  readonly connected: boolean;
  seed(populate: () => Promise<void>): Promise<void>;
}

/** Join through GitLab's provider. Only the elected client populates an empty room. */
export async function openGitLabWikiRoom<StockNode extends StockWikiNode>(
  provider: GitLabWikiProvider, schema: Schema, wire: GitLabWikiWire<StockNode>,
  loadSeed: () => Promise<Node>, options: {signal?: AbortSignal; timeoutMs?: number} = {},
) {
  const {signal, timeoutMs = 15000} = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Expected a positive wiki session timeout.');
  const life = new AbortController();
  const stop = () => life.abort(signal?.reason ?? new Error('GitLab wiki session closed.'));
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort',stop,{once:true});
  const timer = setTimeout(() => life.abort(new Error('GitLab wiki collaboration timed out.')),timeoutMs);
  let cancel!: () => void;
  const cancelled = new Promise<never>((_,reject) => {
    cancel = () => reject(life.signal.reason);
    if (life.signal.aborted) cancel();
    else life.signal.addEventListener('abort',cancel,{once:true});
  });
  let unobserve: (() => void) | undefined;
  try {
    const {seed} = await Promise.race([provider.whenSynced,cancelled]);
    life.signal.throwIfAborted();
    if (!provider.connected) throw new Error('GitLab wiki collaboration is disconnected.');
    const fragment = provider.doc.getXmlFragment('default');
    if (!fragment.length && seed) {
      const initial = await Promise.race([loadSeed(),cancelled]);
      life.signal.throwIfAborted();
      if (!fragment.length) {
        if (initial.type !== schema.topNodeType) throw new Error('Expected the current Fountain wiki schema.');
        const prepared = prepareStockNode(initial,wire);
        await Promise.race([provider.seed(async () => {
          life.signal.throwIfAborted();
          if (!provider.connected) throw new Error('GitLab wiki collaboration is disconnected.');
          if (!fragment.length) wire.updateYFragment(provider.doc,fragment,prepared,{mapping:new Map(),isOMark:new Map()});
        }),cancelled]);
      }
    }
    if (!fragment.length) {
      const populated = new Promise<void>(resolve => {
        const changed = () => { if (fragment.length) resolve(); };
        fragment.observe(changed);
        unobserve = () => fragment.unobserve(changed);
        changed();
      });
      await Promise.race([populated,cancelled]);
    }
    life.signal.throwIfAborted();
    const binding = bindGitLabWikiDocument(fragment,schema,wire);
    return {binding, document:binding.read()};
  } finally {
    unobserve?.();
    clearTimeout(timer);
    signal?.removeEventListener('abort',stop);
    life.signal.removeEventListener('abort',cancel);
  }
}

/** Prepare a stock schema document before the host opens a Yjs write transaction. */
export function toGitLabWikiJSON(doc: Node): NodeJSON {
  doc.type.schema.validate(doc);
  if (doc.type !== doc.type.schema.topNodeType) unsupported([], 'expected document');
  function encode(node: Node, path: readonly number[]): NodeJSON {
    const type = node === doc ? 'doc' : node.isText ? 'text' : stockNodes.get(node.type.name);
    if (!type) unsupported(path,node.type.name);
    const attrs: Attributes = {};
    for (const [key,value] of Object.entries(node.attrs)) {
      if ((type === 'heading' && key === 'level') || (type === 'orderedList' && key === 'start')) attrs[key] = value;
      else if (value !== node.type.spec.attrs?.[key]?.default) unsupported(path,node.type.name + '.' + key);
    }
    const result: NodeJSON = {type};
    if (Object.keys(attrs).length) result.attrs = attrs;
    if (node.isText) result.text = node.text;
    if (node.childCount) result.content = node.content.map((child,index) => encode(child,[...path,index]));
    if (node.marks.length) {
      if (!node.isText) unsupported(path,'marked inline element');
      result.marks = node.marks.map(mark => {
        const name = stockMarks.get(mark.type.name);
        if (!name || Object.keys(mark.attrs).length) unsupported(path,mark.type.name);
        return {type:name};
      });
    }
    return result;
  }
  return encode(doc,[]);
}
