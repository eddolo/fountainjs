import {
  CellSelection,
  TableMap,
  getActiveTableCell,
  resizeTableColumn,
  type Attributes,
  type Editor,
  type Node,
  type NodeDOMContext,
  type NodeViewLike,
} from '../../core';
import { getNodeAtPath } from '../../core/transaction/path';
import { tableBackground } from '../../core/table-background';
import { cellAppearanceAttribute, cellAppearanceDOMAttributes } from '../../core/table-appearance';

const MIN_WIDTH = 40;
const MAX_WIDTH = 2_000;

// Private, relative geometry is shared by the views of one immutable table.
// Announcing every handle must not rebuild/scan the whole grid for every cell.
// Weak keys release old projections with the document/history that owns them.
const resizeMaps = new WeakMap<Node, { map: TableMap; widths: readonly (number | null)[] }>();

function resizeMap(table: Node): { map: TableMap; widths: readonly (number | null)[] } {
  let projection = resizeMaps.get(table);
  if (!projection) {
    const map = TableMap.create(table);
    const columns: (number | null)[] = Array(map.width).fill(null);
    for (const cell of map.cells) for (let offset = 0; offset < cell.colspan; offset += 1) {
      const column = cell.column + offset;
      const width = Array.isArray(cell.node.attrs.colwidth) ? Number(cell.node.attrs.colwidth[offset]) : 0;
      if (columns[column] === null && Number.isFinite(width) && width > 0) columns[column] = width;
    }
    projection = { map, widths: columns };
    resizeMaps.set(table, projection);
  }
  return projection;
}

function validColwidth(value: unknown): boolean {
  return value === null || (Array.isArray(value)
    && value.length <= 100
    && value.every((width) => Number.isInteger(width) && (width === 0 || (width >= MIN_WIDTH && width <= MAX_WIDTH))));
}

export const tableCellAttributes = {
  colspan: { default: 1, validate: (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
  rowspan: { default: 1, validate: (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
  colwidth: { default: null, validate: validColwidth },
  background: { default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= 128 },
  appearance: cellAppearanceAttribute,
} as const;

function widths(node: Node): readonly number[] {
  return Array.isArray(node.attrs.colwidth) ? node.attrs.colwidth.map(Number) : [];
}

export function tableCellDOMAttributes(node: Node, context?: NodeDOMContext): Attributes {
  const colwidth = widths(node);
  const complete = colwidth.length === Number(node.attrs.colspan) && colwidth.every((width) => width > 0);
  const background = tableBackground(node.attrs.background);
  const appearance = cellAppearanceDOMAttributes(node, context);
  const style = [appearance.style, complete ? `width:${colwidth.reduce((sum, width) => sum + width, 0)}px` : '', background ? `background-color:${background}` : ''].filter(Boolean).join(';');
  return {
    ...appearance,
    colspan: node.attrs.colspan,
    rowspan: node.attrs.rowspan,
    ...(colwidth.length ? { 'data-colwidth': colwidth.join(',') } : {}),
    ...(style ? { style } : {}),
  };
}

interface TableEditorView { readonly editor: Editor }

export function createTableCellNodeView(tagName: 'td' | 'th'): new (
  node: Node,
  view: unknown,
  getPath: () => number[],
) => NodeViewLike {
  return class TableCellNodeView implements NodeViewLike {
    readonly dom = document.createElement(tagName);
    readonly contentDOM = document.createElement('div');
    private readonly handle = document.createElement('span');
    private current: Node;
    private startX = 0;
    private startWidth = 0;
    private startDOMWidth = 0;
    private previewWidth = 0;
    private dragging = false;

    constructor(node: Node, private readonly view: unknown, private readonly getPath: () => number[]) {
      this.current = node;
      this.contentDOM.className = 'fountain-table-cell__content';
      this.handle.className = 'fountain-table-cell__resize-handle';
      this.handle.contentEditable = 'false';
      this.handle.tabIndex = 0;
      this.handle.setAttribute('role', 'separator');
      this.handle.setAttribute('aria-orientation', 'vertical');
      this.handle.setAttribute('aria-label', 'Resize table column');
      this.handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
      this.handle.setAttribute('aria-valuemax', String(MAX_WIDTH));
      this.handle.addEventListener('pointerdown', this.onPointerDown);
      this.handle.addEventListener('keydown', this.onKeyDown);
      this.handle.addEventListener('focus', this.onFocus);
      this.dom.append(this.contentDOM, this.handle);
      this.renderAttributes();
    }

    update(node: Node): boolean {
      if (node.type !== this.current.type) return false;
      this.current = node;
      this.renderAttributes();
      return true;
    }

    // Parent appearance can change while this cell remains equal. The existing
    // post-reconciliation hook supplies fresh paths without rebuilding views.
    updateDocument(): void { this.renderAttributes(); }

    stopEvent(event: Event): boolean { return event.target === this.handle; }

    ignoreMutation(mutation: MutationRecord): boolean {
      return mutation.target === this.handle || (mutation.type === 'attributes' && (mutation.target === this.dom || mutation.target === this.contentDOM));
    }

    destroy(): void {
      this.finishDrag(false);
      this.handle.removeEventListener('pointerdown', this.onPointerDown);
      this.handle.removeEventListener('keydown', this.onKeyDown);
      this.handle.removeEventListener('focus', this.onFocus);
    }

    private get editor(): Editor | null {
      const candidate = this.view as Partial<TableEditorView> | null;
      return candidate?.editor ?? null;
    }

    private renderAttributes(): void {
      const editor = this.editor;
      const attrs = tableCellDOMAttributes(this.current, editor ? { document: editor.state.doc, path: this.getPath() } : undefined);
      this.dom.colSpan = Number(attrs.colspan) || 1;
      this.dom.rowSpan = Number(attrs.rowspan) || 1;
      if (tagName === 'th') this.dom.setAttribute('scope', String(this.current.attrs.scope ?? 'col'));
      const colwidth = String(attrs['data-colwidth'] ?? '');
      if (colwidth) this.dom.dataset.colwidth = colwidth;
      else delete this.dom.dataset.colwidth;
      const previewWidth = this.dom.style.width;
      this.dom.style.cssText = String(attrs.style ?? '');
      if (this.dragging) this.dom.style.width = previewWidth;
      const appearance = attrs['data-fountain-table-appearance'];
      if (appearance) this.dom.setAttribute('data-fountain-table-appearance', String(appearance));
      else this.dom.removeAttribute('data-fountain-table-appearance');
      if (attrs['data-fountain-cell-appearance']) this.dom.dataset.fountainCellAppearance = 'true';
      else delete this.dom.dataset.fountainCellAppearance;
      this.contentDOM.style.padding = attrs['data-fountain-cell-appearance'] ? '0' : '';
      this.updateResizeValue();
    }

    private updateResizeValue(): void {
      const width = this.dragging ? this.previewWidth : this.activeColumn()?.width;
      if (width === undefined) return;
      this.handle.setAttribute('aria-valuenow', String(width));
      this.handle.setAttribute('aria-valuetext', `${width} pixels`);
    }

    private activeColumn(): { column: number; tablePath: readonly number[]; width: number } | null {
      const editor = this.editor;
      if (!editor) return null;
      const path = this.getPath();
      const tablePath = path.slice(0, -2);
      try {
        const table = getNodeAtPath(editor.state.doc, tablePath);
        if (table.type.name !== 'table') return null;
        const projection = resizeMap(table);
        const cell = projection.map.cellInfo(path.slice(-2));
        if (!cell) return null;
        const column = cell.column + cell.colspan - 1;
        const configured = projection.widths[column];
        const measured = configured === null ? Math.round(this.dom.getBoundingClientRect().width / cell.colspan) : 0;
        return { column, tablePath, width: configured ?? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, measured || 120)) };
      } catch { return null; /* A detached/stale view cannot resize a different node. */ }
    }

    private commit(width: number): boolean {
      const editor = this.editor;
      const active = this.activeColumn();
      return Boolean(editor && active && resizeTableColumn(editor, width, active.column, active.tablePath));
    }

    private onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const active = this.activeColumn();
      if (!active) return;
      event.preventDefault();
      this.handle.focus({ preventScroll: true });
      this.dragging = true;
      this.startX = event.clientX;
      this.startWidth = active.width;
      this.startDOMWidth = this.dom.getBoundingClientRect().width || active.width * Number(this.current.attrs.colspan || 1);
      this.previewWidth = active.width;
      this.updateResizeValue();
      this.dom.dataset.fountainResizing = 'true';
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp, { once: true });
      window.addEventListener('pointercancel', this.onPointerCancel, { once: true });
    };

    private onPointerMove = (event: PointerEvent): void => {
      if (!this.dragging) return;
      this.previewWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(this.startWidth + event.clientX - this.startX)));
      this.dom.style.width = `${Math.max(MIN_WIDTH, this.startDOMWidth + event.clientX - this.startX)}px`;
      this.updateResizeValue();
    };

    private onPointerUp = (): void => { this.finishDrag(true); };
    private onPointerCancel = (): void => { this.finishDrag(false); };

    private onFocus = (): void => {
      // Auto-sized columns may change without a document transaction.
      this.updateResizeValue();
      const editor = this.editor;
      if (!editor) return;
      const path = this.getPath();
      const active = getActiveTableCell(editor);
      if (active?.cell.path.join('.') === path.join('.')) return;
      try {
        editor.dispatch(editor.state.createTransaction().setSelection(new CellSelection(editor.state.doc, path)));
      } catch { /* Ignore a stale handle while the table is being redrawn. */ }
    };

    private finishDrag(commit: boolean): void {
      if (!this.dragging) return;
      this.dragging = false;
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerCancel);
      delete this.dom.dataset.fountainResizing;
      if (commit) this.commit(this.previewWidth);
      this.renderAttributes();
    }

    private onKeyDown = (event: KeyboardEvent): void => {
      const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (!direction) return;
      const active = this.activeColumn();
      if (!active) return;
      event.preventDefault();
      this.commit(active.width + direction * (event.shiftKey ? 25 : 5));
    };
  };
}
