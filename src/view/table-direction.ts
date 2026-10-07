import { addTableColumn, getActiveTableCell, type Editor } from '../core';

type Direction = 'ltr' | 'rtl';
type Roots = { roots: Set<HTMLElement>; listeners: Set<() => void>; lastFocused?: HTMLElement };
const mountedRoots = new WeakMap<Editor, Roots>();
const ownedRoots = new WeakSet<HTMLElement>();
const rootsFor = (editor: Editor): Roots => {
  let entry = mountedRoots.get(editor);
  if (!entry) { entry = { roots: new Set(), listeners: new Set() }; mountedRoots.set(editor, entry); }
  return entry;
};
const releaseIfEmpty = (editor: Editor, entry: Roots): void => {
  if (!entry.roots.size && !entry.listeners.size) mountedRoots.delete(editor);
};

export function observeTableDirectionRoots(editor: Editor, listener: () => void): () => void {
  const entry = rootsFor(editor); entry.listeners.add(listener);
  return () => { entry.listeners.delete(listener); releaseIfEmpty(editor, entry); };
}

/** Private view ownership, not a document/core property or a global DOM query. */
export function registerTableDirectionRoot(editor: Editor, root: HTMLElement): () => void {
  const owned = rootsFor(editor);
  owned.roots.add(root);
  ownedRoots.add(root);
  const notify = () => { owned.listeners.forEach(listener => listener()); };
  const focused = () => { owned.lastFocused = root; notify(); };
  root.addEventListener('focusin', focused);
  notify();
  return () => {
    root.removeEventListener('focusin', focused);
    owned.roots.delete(root);
    ownedRoots.delete(root);
    if (owned.lastFocused === root) owned.lastFocused = undefined;
    notify(); releaseIfEmpty(editor, owned);
  };
}

/** CSS/inherited/auto direction belongs to the mounted table, not its text cell. */
export function getRenderedTableDirection(editor: Editor): Direction | undefined {
  const active = getActiveTableCell(editor), entry = mountedRoots.get(editor);
  if (!active || !entry) return undefined;
  const roots = [...entry.roots].filter(root => root.isConnected);
  const read = (root: HTMLElement): Direction | undefined => {
    const table = root.querySelector<HTMLElement>(`table[data-fountain-path="${active.tablePath.join('.')}"]`);
    if (!table) return undefined;
    let owner: HTMLElement | null = table;
    while (owner && !ownedRoots.has(owner)) owner = owner.parentElement;
    if (owner !== root) return undefined;
    const direction = root.ownerDocument.defaultView?.getComputedStyle(table).direction;
    return direction === 'ltr' || direction === 'rtl' ? direction : undefined;
  };
  const focused = roots.find(root => root.contains(root.ownerDocument.activeElement));
  if (focused) return read(focused);
  if (entry.lastFocused && roots.includes(entry.lastFocused)) return read(entry.lastFocused);
  const selected = roots.filter(root => {
    const selection = root.ownerDocument.getSelection();
    return selection?.anchorNode && selection.focusNode
      && root.contains(selection.anchorNode) && root.contains(selection.focusNode);
  });
  if (selected.length === 1) return read(selected[0]);
  const directions = roots.map(read);
  // Multiple unfocused views are safe only when every mounted table agrees.
  return directions.length && directions.every(direction => direction === directions[0])
    ? directions[0] : undefined;
}

/** Re-read at activation, since a host can change CSS after opening the toolbar. */
export function addTableColumnOnSide(editor: Editor, side: 'left' | 'right'): boolean {
  const direction = getRenderedTableDirection(editor);
  if (!direction) return false;
  return addTableColumn(editor, (side === 'left') === (direction === 'ltr') ? 'before' : 'after');
}
