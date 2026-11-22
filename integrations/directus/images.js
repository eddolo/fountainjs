import { NodeSelection, isSafeURL } from '../../src/index';
import { getNodeAtPath } from '../../src/core/transaction/path';

const asset = 'directus_asset';
const inlineAsset = 'directus_inline_asset';
const figure = 'directus_figure';
const caption = 'directus_caption';
const isAsset = el => el?.matches('img[src][alt]') &&
  el.getAttributeNames().every(name => ['src','alt','loading'].includes(name));
const isFigure = el => el?.matches('figure') && el.attributes.length === 0 && el.children.length === 2 &&
  isAsset(el.firstElementChild) && el.lastElementChild.matches('figcaption') && el.lastElementChild.attributes.length === 0;

const assetSpec = {
  group:'block', atom:true, selectable:true,
  attrs:{
    src:{ validate: value => typeof value === 'string' && isSafeURL(value) },
    alt:{ default:'', validate: value => typeof value === 'string' },
    loading:{ default:null, validate: value => value === null || value === 'lazy' || value === 'eager' },
  },
  parseDOM:[{tag:'img[src]', getAttrs:el => isAsset(el) ? {src:el.getAttribute('src'),alt:el.alt,loading:el.getAttribute('loading')} : false}],
  toDOM: node => ['img', {src:node.attrs.src, alt:node.attrs.alt, loading:node.attrs.loading}],
};

export const imageNodes = {
  [asset]: assetSpec,
  [inlineAsset]: { ...assetSpec, inline: true, group: 'inline' },
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
    if (node.type.name === figure) {
      const existingCaption = node.child(1);
      return { doc, path:at, image:node.child(0), figure:node, caption:existingCaption.textContent,
        richCaption:existingCaption.content.some(child => !child.isText || child.marks.length > 0) };
    }
    if (node.type.name === inlineAsset) return { doc, path:at, image:node, inline:true, caption:'' };
    if (node.type.name === asset && getNodeAtPath(doc,at.slice(0,-1)).type.name !== figure) {
      return {doc, path:at, image:node, caption:''};
    }
  }
  if (selection.kind !== 'text' || !selection.isCollapsed || path.length < 2) return null;
  const blockPath = path.slice(0,-1), block = getNodeAtPath(doc,blockPath);
  return ['paragraph','heading'].includes(block.type.name) && getNodeAtPath(doc,path).isText
    ? {doc, selection} : null;
}

export function saveImage(editor, target, attrs, captionText, inline = false) {
  if (!editor?.editable || editor.state.doc !== target.doc) return false;
  const schema = editor.state.schema;
  const text = captionText.trim();
  if (inline && (target.figure || text)) return false;
  // Block nodes cannot carry the inline image’s formatting and link marks.
  if (!inline && target.inline && target.image.marks.length) return false;
  const image = schema.node(inline ? inlineAsset : asset, attrs, [], undefined,
    inline && target.image ? target.image.marks : []);
  if (target.richCaption && captionText !== target.caption) return false;
  const captionNode = target.figure && target.caption === captionText
    ? target.figure.child(1) : text && schema.node(caption,{},[schema.text(text)]);
  const content = captionNode ? schema.node(figure,{},[image,captionNode]) : image;
  const transaction = editor.createTransaction();
  let imagePath;
  if (target.image && (!target.inline || inline)) {
    const wrap = inline && !target.inline;
    transaction.replaceNode(target.path, [wrap ? schema.node('paragraph', {}, [image]) : content]);
    imagePath = wrap ? [...target.path, 0] : target.path;
  } else {
    const path = target.inline ? target.path : target.selection.path;
    const blockPath = path.slice(0, -1);
    const block = getNodeAtPath(target.doc, blockPath);
    const index = path.at(-1), leaf = block.child(index);
    const left = [...block.content.slice(0,index)];
    const right = [...block.content.slice(index+1)];
    if (!target.inline) {
      const offset = target.selection.from;
      if (offset) left.push(leaf.withText(leaf.text.slice(0, offset)));
      if (offset < leaf.text.length) right.unshift(leaf.withText(leaf.text.slice(offset)));
    }
    if (inline) {
      transaction.replaceNode(blockPath, [block.copy([...left, image, ...right])]);
      imagePath = [...blockPath, left.length];
    } else {
      const before = left.length ? [block.copy(left)] : [];
      const after = right.length ? [block.copy(right)] : [];
      const parent = getNodeAtPath(target.doc, blockPath.slice(0,-1));
      if (!after.length && blockPath.at(-1) === parent.childCount-1) after.push(schema.node('paragraph',{},[schema.text('')]));
      transaction.replaceNode(blockPath,[...before,content,...after]);
      imagePath = [...blockPath.slice(0,-1),blockPath.at(-1)+before.length];
    }
  }
  // A host schema can require a paragraph in this slot (for example a list item).
  try { schema.validate(transaction.doc); } catch { return false; }
  const selected = captionNode ? [...imagePath,0] : imagePath;
  transaction.setSelection(new NodeSelection(transaction.doc,selected));
  return editor.dispatch(transaction);
}
