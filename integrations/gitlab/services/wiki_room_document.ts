import type { Attributes, MarkJSON, Node, NodeJSON, Schema } from 'fountainjs-editor';
import type * as Y from 'yjs';

// Use the host's Yjs constructors. The GitLab runtime and the Fountain bundle
// can be built separately and a second Yjs installation has different identities.
type XmlTypes = Pick<typeof Y, 'XmlText' | 'XmlElement'>;
const nodes = new Map(Object.entries({
  paragraph:'paragraph', heading:'heading', blockquote:'blockquote', bulletList:'bullet_list',
  table:'table', tableRow:'table_row', tableHeader:'table_header', tableCell:'table_cell',
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

function isStockCell(type: string) { return type === 'tableCell' || type === 'tableHeader'; }

function stockAttrs(type: string, attrs: Attributes, path: readonly number[]): Attributes {
  const result: Attributes = {};
  for (const [key,value] of Object.entries(attrs)) {
    if ((type === 'heading' && key === 'level') || (type === 'orderedList' && key === 'start')) result[key] = value;
    else if (type === 'table' && key === 'isMarkdown' && (value === null || typeof value === 'boolean')) result.gitlabIsMarkdown = value;
    else if (isStockCell(type) && ['colspan','rowspan','colwidth'].includes(key)) result[key] = value;
    else if (isStockCell(type) && key === 'align' && (value === 'left' || value === 'center' || value === 'right')) continue;
    else if (type === 'bulletList' && key === 'bullet' && (value === '+' || value === '-')) result.gitlabBullet = value;
    else if (!(type === 'blockquote' && key === 'multiline' && value === false)
      && !(type === 'orderedList' && ((key === 'parens' && value === false) || (key === 'type' && value === null)))
      && !(type === 'bulletList' && key === 'bullet' && value === '*')) unsupported(path, type + '.' + key);
  }
  return result;
}

function fromStockNode(name: string, attrs: Attributes, content: NodeJSON[] | undefined, path: readonly number[]): NodeJSON {
  const type = name === 'doc' || name === 'text' ? name : nodes.get(name);
  if (!type) unsupported(path,name);
  const projected = stockAttrs(name,attrs,path);
  if (isStockCell(name) && (attrs.align === 'center' || attrs.align === 'right')) {
    // GitLab places alignment on the cell. Fountain's editable paragraphs own it.
    content = content?.map(child => {
      if (child.type !== 'paragraph') unsupported(path,'aligned cell containing ' + child.type);
      return {...child,attrs:{...child.attrs,align:attrs.align}};
    });
  }
  // ProseMirror represents an empty text block with no children. Fountain uses an
  // empty text leaf for a caret that can receive typing, paste or an attachment.
  if ((type === 'paragraph' || type === 'heading') && !content?.length) content = [{type:'text',text:''}];
  return {type,attrs:projected,content};
}

/** Both projection validation and live room reads must interpret the stock marks identically. */
function fromStockMark(name: string, value: unknown, path: readonly number[]): MarkJSON {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unsupported(path,name);
  const attrs = value as Attributes;
  if (name === 'link') {
    if (typeof attrs.uploading === 'string') {
      for (const [key,flag] of Object.entries(attrs)) {
        if (key === 'uploading' || key === 'href' || (['title','canonicalSrc'].includes(key) && flag === null)
          || (['isReference','isGollumLink','isWikiPage'].includes(key) && flag === false)) continue;
        unsupported(path,'pending link.' + key);
      }
      return {type:'gitlab_pending_wiki_file',attrs:{uploadId:attrs.uploading,objectURL:attrs.href}};
    }
    for (const [key,flag] of Object.entries(attrs)) {
      if (key === 'href' || key === 'title' || key === 'canonicalSrc') continue;
      if (attrs.isGollumLink === true && typeof attrs.canonicalSrc === 'string' && attrs.canonicalSrc.length &&
        (key === 'isGollumLink' || key === 'isWikiPage') && typeof flag === 'boolean') continue;
      if (['uploading','isGollumLink','isWikiPage','isReference'].includes(key) && flag === false) continue;
      unsupported(path,'link.' + key);
    }
    // The GitLab schema validates both URLs when constructing the Fountain mark.
    return {type:'link',attrs:{href:attrs.href,title:attrs.title ?? '',gitlabCanonicalSrc:attrs.canonicalSrc ?? undefined,
      ...(attrs.isGollumLink ? {gitlabWikiLink:attrs.isWikiPage ? 'page' : 'external'} : {})}};
  }
  const type = marks.get(name);
  if (!type || Object.keys(attrs).length) unsupported(path,name);
  return {type};
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
            formatting.push(fromStockMark(name,attrs,childPath));
          }
          content.push({type:'text',text:span.insert,marks:formatting});
        }
      } else if (child instanceof types.XmlElement && nodes.has(child.nodeName)) {
        content.push(fromStockNode(child.nodeName,child.getAttributes(),children(child,childPath),childPath));
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

function isEmptyCaret(node: Node): boolean {
  return node.isText && node.text === '' && !node.marks.length && !Object.keys(node.attrs).length;
}

function withoutEmptyCarets(node: Node): Node {
  if (!node.childCount) return node;
  const textBlock = node.type.name === 'paragraph' || node.type.name === 'heading';
  const content = node.content.filter(child => !(textBlock && isEmptyCaret(child))).map(withoutEmptyCarets);
  return content.length === node.childCount && content.every((child,index) => child === node.child(index)) ? node : node.copy(content);
}

export function sameWikiDocument(left: Node, right: Node): boolean {
  return left.eq(right) || withoutEmptyCarets(left).eq(withoutEmptyCarets(right));
}

type StockWikiNode = { check(): void; toJSON(): NodeJSON };

function prepareStockNode<T extends StockWikiNode>(document: Node, wire: GitLabWikiWire<T>): T {
  const native = document.type.schema;
  const prepared = wire.stockSchema.nodeFromJSON(toGitLabWikiJSON(document));
  prepared.check();
  // A stock schema can accept JSON while silently discarding unknown attributes.
  // Validate the actual stock projection before touching the live fragment.
  function project(node: NodeJSON, path: readonly number[]): NodeJSON {
    const content = node.content?.map((child,index) => project(child,[...path,index]));
    return {...fromStockNode(node.type,node.attrs ?? {},content,path),text:node.text,
      marks:node.marks?.map(mark => fromStockMark(mark.type,mark.attrs ?? {},path))};
  }
  if (!sameWikiDocument(native.nodeFromJSON(project(prepared.toJSON(),[])),document))
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
    if (before.type.schema !== schema || after.type.schema !== schema || !sameWikiDocument(read(),before))
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
  let pendingConfirmation: ReturnType<typeof setInterval> | undefined;
  try {
    const {seed} = await Promise.race([provider.whenSynced,cancelled]);
    life.signal.throwIfAborted();
    // ActionCable may deliver the initial document before it confirms the subscription.
    // GitLab exposes that confirmation as a boolean. Wait only while joining this room.
    if (!provider.connected) {
      const confirmed = new Promise<void>(resolve => {
        pendingConfirmation = setInterval(() => { if (provider.connected) resolve(); }, 25);
      });
      await Promise.race([confirmed,cancelled]);
      clearInterval(pendingConfirmation);
      life.signal.throwIfAborted();
    }
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
    clearInterval(pendingConfirmation);
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
  function encode(node: Node, path: readonly number[], inheritedCellAlign?: unknown): NodeJSON {
    const type = node === doc ? 'doc' : node.isText ? 'text' : stockNodes.get(node.type.name);
    if (!type) unsupported(path,node.type.name);
    const attrs: Attributes = {};
    for (const [key,value] of Object.entries(node.attrs)) {
      if ((type === 'heading' && key === 'level') || (type === 'orderedList' && key === 'start')) attrs[key] = value;
      else if (type === 'table' && key === 'gitlabIsMarkdown') attrs.isMarkdown = value;
      else if (isStockCell(type) && ['colspan','rowspan','colwidth'].includes(key)) attrs[key] = value;
      else if (type === 'paragraph' && key === 'align' && inheritedCellAlign === value) continue;
      else if (type === 'bulletList' && key === 'gitlabBullet' && (value === '+' || value === '-')) attrs.bullet = value;
      else if (value !== node.type.spec.attrs?.[key]?.default) unsupported(path,node.type.name + '.' + key);
    }
    if (isStockCell(type)) {
      const align = node.content[0]?.attrs.align ?? 'left';
      if (!['left','center','right'].includes(String(align)) ||
        node.content.some(child => (child.attrs.align ?? 'left') !== align || (align !== 'left' && child.type.name !== 'paragraph')))
        unsupported(path,'mixed or unsupported cell alignment');
      attrs.align = align;
    }
    const result: NodeJSON = {type};
    if (Object.keys(attrs).length) result.attrs = attrs;
    if (node.isText) result.text = node.text;
    if (node.childCount) {
      const content = node.content.flatMap((child,index) => (type === 'paragraph' || type === 'heading') && isEmptyCaret(child)
        ? [] : [encode(child,[...path,index],isStockCell(type) ? attrs.align : undefined)]);
      if (content.length) result.content = content;
    }
    if (node.marks.length) {
      if (!node.isText) unsupported(path,'marked inline element');
      result.marks = node.marks.map(mark => {
        if (mark.type.name === 'gitlab_pending_wiki_file')
          return {type:'link',attrs:{uploading:mark.attrs.uploadId,href:mark.attrs.objectURL}};
        if (mark.type.name === 'link') {
          const {href,title,gitlabCanonicalSrc,gitlabWikiLink} = mark.attrs;
          if (gitlabWikiLink && !gitlabCanonicalSrc) unsupported(path,'wiki link without authored target');
          for (const [key,value] of Object.entries(mark.attrs)) {
            if (!['href','title','gitlabCanonicalSrc','gitlabWikiLink'].includes(key) && value !== mark.type.spec.attrs?.[key]?.default)
              unsupported(path,'link.' + key);
          }
          return {type:'link',attrs:{href,title:title || null,canonicalSrc:gitlabCanonicalSrc ?? null,
            ...(gitlabWikiLink ? {isGollumLink:true,isWikiPage:gitlabWikiLink === 'page'} : {})}};
        }
        const name = stockMarks.get(mark.type.name);
        if (!name || Object.keys(mark.attrs).length) unsupported(path,mark.type.name);
        return {type:name};
      });
    }
    return result;
  }
  return encode(doc,[]);
}
