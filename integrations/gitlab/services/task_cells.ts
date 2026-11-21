import type { Node } from 'fountainjs-editor';
import type { DefaultTreeAdapterMap } from 'parse5';

type Element = DefaultTreeAdapterMap['element'];
type State = boolean | 'inapplicable';
type CellStates = Map<number,State>;
const attr = (element: Element, key: string) => element.attrs.find(a => a.name === key)?.value;
const marker = (state: State) => state === 'inapplicable' ? '[~]' : state ? '[x]' : '[ ]';
export const isCell = (node: Node) => node.type.name === 'table_cell' || node.type.name === 'table_header';

// GitLab's renderer locates the checkbox by its byte column in the authored Markdown.
// Require both the complete cell and its one child input to agree with that source.
export function readTaskCells(elements: readonly Element[], source: string, states: CellStates): void {
  const lines = source.split(/\r\n?|\n/u);
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let index = -1, previousRow = '', bytes = new Uint8Array();
  for (const cell of elements) {
    if (cell.tagName !== 'td' && cell.tagName !== 'th') continue;
    index++;
    if (!attr(cell,'class')?.split(/\s+/u).includes('task-table-item')) continue;
    const children = cell.childNodes.filter(child => !('value' in child && /^[ \t\n\r]*$/u.test(child.value)));
    const input = children[0];
    if (children.length !== 1 || !input || !('tagName' in input) || input.tagName !== 'input'
      || attr(input,'type') !== 'checkbox' || !attr(input,'class')?.split(/\s+/u).includes('task-list-item-checkbox'))
      throw new Error('Expected one GitLab table checkbox.');
    const checked = attr(input,'checked') !== undefined, inactive = attr(input,'data-inapplicable') !== undefined;
    const state = inactive ? 'inapplicable' : checked;
    const cellPos = /^(\d+):(\d+)-\1:(\d+)$/u.exec(attr(cell,'data-sourcepos') ?? '');
    const point = /^(\d+):(\d+)-\1:\2$/u.exec(attr(input,'data-checkbox-sourcepos') ?? '');
    const row = cellPos?.[1] ?? '';
    if (row !== previousRow) { bytes = encoder.encode(lines[Number(row)-1] ?? ''); previousRow = row; }
    const left = Number(cellPos?.[2])-1, end = Number(cellPos?.[3]), center = Number(point?.[2])-1;
    const authored = decoder.decode(bytes.slice(left,end)).replace(/^[ \t]+|[ \t]+$/gu,'');
    if ((checked && inactive) || !cellPos || !point || cellPos[1] !== point[1] || left >= center || center+1 >= end
      || end > bytes.length || authored.toLowerCase() !== marker(state)
      || decoder.decode(bytes.slice(center-1,center+2)) !== authored)
      throw new Error('GitLab table checkbox and Markdown cell disagree.');
    states.set(index,state);
    cell.childNodes = [{nodeName:'#text',value:authored,parentNode:cell}];
  }
}

export function hydrateTaskCells(doc: Node, states: CellStates): Node {
  if (!states.size) return doc;
  let index = -1, found = 0;
  const schema = doc.type.schema;
  function visit(node: Node): Node {
    if (isCell(node)) {
      const state = states.get(++index);
      if (state !== undefined) {
        const p = node.content[0];
        if (node.childCount !== 1 || p?.type.name !== 'paragraph' || p.childCount !== 1
          || !p.child(0).isText || p.child(0).marks.length || p.textContent.toLowerCase() !== marker(state))
          throw new Error('Imported table checkbox differs from the verified cell.');
        found++;
        const task = schema.node('task_item',{checked:state,gitlabTableItem:true},[p.copy([schema.text('')])]);
        return node.copy([schema.node('task_list',{},[task])]);
      }
    }
    const children = node.content.map(visit);
    return children.some((child,i) => child !== node.child(i)) ? node.copy(children) : node;
  }
  const result = visit(doc);
  if (found !== states.size) throw new Error('Missing verified table checkbox.');
  return result;
}

export function taskCellBody(cell: Node): Node | undefined {
  if (!isCell(cell) || cell.childCount !== 1) return;
  const list = cell.child(0), task = list.content[0], p = task?.content[0];
  if (list.type.name !== 'task_list' || list.childCount !== 1 || task?.type.name !== 'task_item'
    || !task.attrs.gitlabTableItem || task.childCount !== 1 || p?.type.name !== 'paragraph'
    || p.content.some(child => !child.isText || child.text !== '' || child.marks.length)) return;
  return p;
}

export function taskCellParagraph(cell: Node): Node | undefined {
  const p = taskCellBody(cell);
  if (!p) return;
  return p.copy([p.type.schema.text(marker(cell.child(0).child(0).attrs.checked as State))]);
}
