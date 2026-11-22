import { NodeSelection, isSafeURL } from '../../src/index';
import { getNodeAtPath } from '../../src/core/transaction/path';

const asset = 'directus_asset';
const figure = 'directus_figure';
const caption = 'directus_caption';
const isAsset = el => el?.matches('img[src][alt]') &&
  el.getAttributeNames().every(name => ['src','alt','loading'].includes(name));
const isFigure = el => el?.matches('figure') && el.attributes.length === 0 && el.children.length === 2 &&
  isAsset(el.firstElementChild) && el.lastElementChild.matches('figcaption') && el.lastElementChild.attributes.length === 0;

export const imageNodes = {
  [asset]: {
    group:'block', atom:true, selectable:true,
    attrs:{
      src:{ validate: value => typeof value === 'string' && isSafeURL(value) },
      alt:{ default:'', validate: value => typeof value === 'string' },
      loading:{ default:null, validate: value => value === null || value === 'lazy' || value === 'eager' },
    },
    parseDOM:[{tag:'img[src]', getAttrs:el => isAsset(el) ? {src:el.getAttribute('src'),alt:el.alt,loading:el.getAttribute('loading')} : false}],
    toDOM: node => ['img', {src:node.attrs.src, alt:node.attrs.alt, loading:node.attrs.loading}],
  },
  [figure]: {
    group:'block', content:asset + ' ' + caption,
    parseDOM:[{tag:'figure',getAttrs:el => isFigure(el) ? {} : false}],
    toDOM: () => ['figure',{},0],
  },
  [caption]: { content:'inline*', parseDOM:[{tag:'figcaption',getAttrs:el => isFigure(el.parentElement) ? {} : false}], toDOM:() => ['figcaption',{},0] },
};

export function imageTarget(editor) {
  if (!editor?.editable) return null;
  const {doc,selection} = editor.state;
  const path = selection.kind === 'node' ? selection.nodePath : selection.path;
  for (let size=path.length;size>0;size--) {
    const at = path.slice(0,size);
    const node = getNodeAtPath(doc,at);
    if (node.type.name === figure) return { doc, path:at, image:node.child(0), figure:node, caption:node.child(1).textContent };
    if (node.type.name === asset && getNodeAtPath(doc,at.slice(0,-1)).type.name !== figure) {
      return {doc, path:at, image:node, caption:''};
    }
  }
  if (selection.kind !== 'text' || !selection.isCollapsed || path.length < 2) return null;
  const blockPath = path.slice(0,-1), block = getNodeAtPath(doc,blockPath);
  return ['paragraph','heading'].includes(block.type.name) && getNodeAtPath(doc,path).isText
    ? {doc, selection, block, blockPath} : null;
}

export function saveImage(editor, target, attrs, captionText) {
  if (!editor?.editable || editor.state.doc !== target.doc) return false;
  const schema = editor.state.schema;
  const image = schema.node(asset,attrs);
  const text = captionText.trim();
  const captionNode = text && (target.figure && target.caption === text
    ? target.figure.child(1) : schema.node(caption,{},[schema.text(text)]));
  const content = captionNode ? schema.node(figure,{},[image,captionNode]) : image;
  const transaction = editor.createTransaction();
  let imagePath;
  if (target.image) {
    transaction.replaceNode(target.path,[content]);
    imagePath = target.path;
  } else {
    const {block,blockPath,selection} = target;
    const index = selection.path.at(-1), leaf = block.child(index);
    const left = [...block.content.slice(0,index)];
    const right = [...block.content.slice(index+1)];
    if (selection.from) left.push(leaf.withText(leaf.text.slice(0,selection.from)));
    if (selection.from < leaf.text.length) right.unshift(leaf.withText(leaf.text.slice(selection.from)));
    const before = left.length ? [block.copy(left)] : [];
    const after = right.length ? [block.copy(right)] : [];
    const parent = getNodeAtPath(target.doc, blockPath.slice(0,-1));
    if (!after.length && blockPath.at(-1) === parent.childCount-1) after.push(schema.node('paragraph',{},[schema.text('')]));
    transaction.replaceNode(blockPath,[...before,content,...after]);
    imagePath = [...blockPath.slice(0,-1),blockPath.at(-1)+before.length];
  }
  // A host schema can require a paragraph in this slot (for example a list item).
  try { schema.validate(transaction.doc); } catch { return false; }
  const selected = captionNode ? [...imagePath,0] : imagePath;
  transaction.setSelection(new NodeSelection(transaction.doc,selected));
  return editor.dispatch(transaction);
}
