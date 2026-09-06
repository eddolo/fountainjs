import {
  CellSelection,
  getActiveTableCell,
  resizeTableColumn,
  type Attributes,
  type Editor,
  type Node,
  type NodeViewLike,
} from '../../core';

const MIN_WIDTH = 40;
const MAX_WIDTH = 2_000;

function validColwidth(value: unknown): boolean {
  return value === null || (Array.isArray(value)
    && value.length <= 100
    && value.every((width) => Number.isInteger(width) && (width === 0 || (width >= MIN_WIDTH && width <= MAX_WIDTH))));
}

export const tableCellAttributes = {
  colspan: { default: 1, validate: (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
  rowspan: { default: 1, validate: (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
  colwidth: { default: null, validate: validColwidth },
} as const;

function widths(node: Node): readonly number[] {
  return Array.isArray(node.attrs.colwidth) ? node.attrs.colwidth.map(Number) : [];
}

export function tableCellDOMAttributes(node: Node): Attributes {
  const colwidth = widths(node);
  const complete = colwidth.length === Number(node.attrs.colspan) && colwidth.every((width) => width > 0);
  return {
    colspan: node.attrs.colspan,
    rowspan: node.attrs.rowspan,
    ...(colwidth.length ? { 'data-colwidth': colwidth.join(',') } : {}),
    ...(complete ? { style: `width:${colwidth.reduce((sum, width) => sum + width, 0)}px` } : {}),
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

    stopEvent(event: Event): boolean { return event.target === this.handle; }

    ignoreMutation(mutation: MutationRecord): boolean {
      return mutation.target === this.handle || (mutation.type === 'attributes' && mutation.target === this.dom);
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
      const attrs = tableCellDOMAttributes(this.current);
      this.dom.colSpan = Number(attrs.colspan) || 1;
      this.dom.rowSpan = Number(attrs.rowspan) || 1;
      if (tagName === 'th') this.dom.setAttribute('scope', String(this.current.attrs.scope ?? 'col'));
      const colwidth = String(attrs['data-colwidth'] ?? '');
      if (colwidth) this.dom.dataset.colwidth = colwidth;
      else delete this.dom.dataset.colwidth;
      if (!this.dragging) this.dom.style.width = typeof attrs.style === 'string' ? attrs.style.slice(6, -2) + 'px' : '';
    }

    private activeColumn(): { column: number; tablePath: readonly number[]; width: number } | null {
      const editor = this.editor;
      if (!editor) return null;
      const context = getActiveTableCell(editor, this.getPath());
      if (!context) return null;
      const column = context.cell.column + context.cell.colspan - 1;
      const configured = context.map.columnWidth(column);
      const measured = Math.round(this.dom.getBoundingClientRect().width / context.cell.colspan);
      return { column, tablePath: context.tablePath, width: configured ?? Math.max(MIN_WIDTH, measured || 120) };
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
      this.dragging = true;
      this.startX = event.clientX;
      this.startWidth = active.width;
      this.startDOMWidth = this.dom.getBoundingClientRect().width || active.width * Number(this.current.attrs.colspan || 1);
      this.previewWidth = active.width;
      this.dom.dataset.fountainResizing = 'true';
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp, { once: true });
      window.addEventListener('pointercancel', this.onPointerCancel, { once: true });
    };

    private onPointerMove = (event: PointerEvent): void => {
      if (!this.dragging) return;
      this.previewWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(this.startWidth + event.clientX - this.startX)));
      this.dom.style.width = `${Math.max(MIN_WIDTH, this.startDOMWidth + event.clientX - this.startX)}px`;
      this.handle.setAttribute('aria-valuenow', String(this.previewWidth));
    };

    private onPointerUp = (): void => { this.finishDrag(true); };
    private onPointerCancel = (): void => { this.finishDrag(false); };

    private onFocus = (): void => {
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
      else this.renderAttributes();
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
