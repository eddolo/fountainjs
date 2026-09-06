import {
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

export type FountainToolbarGroupId =
  | 'history'
  | 'block-types'
  | 'marks'
  | 'alignment'
  | 'insert'
  | 'table';

export const defaultFountainToolbarGroups: readonly FountainToolbarGroupId[] = Object.freeze([
  'history', 'block-types', 'marks', 'alignment', 'insert', 'table',
]);

export type FountainToolbarActionId =
  | 'undo' | 'redo' | 'search' | 'clipboard-history'
  | 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'inline-code' | 'highlight'
  | 'subscript' | 'superscript' | 'link' | 'unlink' | 'text-color' | 'clear-text-color'
  | 'text-style'
  | 'align-left' | 'align-center' | 'align-right' | 'justify'
  | 'quote' | 'bullet-list' | 'ordered-list' | 'task-list' | 'outdent-list' | 'indent-list'
  | 'code-block' | 'insert-table' | 'image' | 'upload-image' | 'media' | 'upload-asset'
  | 'divider' | 'hard-break'
  | 'add-table-row' | 'delete-table-row' | 'add-table-column' | 'delete-table-column'
  | 'delete-table'
  | 'merge-cells' | 'split-cell' | 'toggle-header-row' | 'toggle-header-column'
  | 'toggle-header-cell' | 'select-row' | 'select-column' | 'column-width';

export interface FountainToolbarIconProps extends SVGProps<SVGSVGElement> {
  name: FountainToolbarActionId;
}

function lines(alignment: 'left' | 'center' | 'right' | 'justify') {
  const rows = alignment === 'justify'
    ? [[3, 21], [3, 21], [3, 21], [3, 21]]
    : alignment === 'center'
      ? [[5, 19], [3, 21], [6, 18], [4, 20]]
      : alignment === 'right'
        ? [[7, 21], [3, 21], [9, 21], [5, 21]]
        : [[3, 17], [3, 21], [3, 15], [3, 19]];
  return rows.map(([from, to], index) => <path key={index} d={`M${from} ${5 + index * 5}h${to - from}`} />);
}

/** Dependency-free currentColor iconography used by the default toolbar. */
export function FountainToolbarIcon({ name, ...props }: FountainToolbarIconProps) {
  let content: ReactNode;
  if (name === 'undo' || name === 'redo') content = <><path d={name === 'undo' ? 'M9 7 4 12l5 5' : 'm15 7 5 5-5 5'} /><path d={name === 'undo' ? 'M20 17a8 8 0 0 0-13-6' : 'M4 17a8 8 0 0 1 13-6'} /></>;
  else if (name === 'search') content = <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>;
  else if (name === 'clipboard-history') content = <><path d="M9 5h6M9 3h6v4H9zM7 5H5v16h14V5h-2" /><path d="M8 12h8M8 16h5" /></>;
  else if (name === 'paragraph') content = <><path d="M17 4H10a4 4 0 0 0 0 8h3M13 4v16M17 4v16" /></>;
  else if (name.startsWith('heading-')) content = <text x="12" y="16" textAnchor="middle" stroke="none" fill="currentColor" fontSize="11" fontWeight="700">H{name.at(-1)}</text>;
  else if (name === 'bold') content = <path d="M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z" />;
  else if (name === 'italic') content = <><path d="M10 4h7M7 20h7M14 4 10 20" /></>;
  else if (name === 'underline') content = <><path d="M6 4v7a6 6 0 0 0 12 0V4M5 21h14" /></>;
  else if (name === 'strike') content = <><path d="M17 6c-1-2-3-3-5-3-3 0-5 1-5 4 0 5 10 2 10 8 0 3-2 5-5 5-2 0-5-1-6-3M4 12h16" /></>;
  else if (name === 'inline-code' || name === 'code-block') content = <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>;
  else if (name === 'highlight') content = <><path d="m7 16 8-12 4 4-12 8-3 4zM3 21h18" /></>;
  else if (name === 'subscript' || name === 'superscript') content = <><path d="m5 6 8 12M13 6 5 18" /><text x="18" y={name === 'subscript' ? '20' : '9'} textAnchor="middle" stroke="none" fill="currentColor" fontSize="7" fontWeight="700">2</text></>;
  else if (name === 'link' || name === 'unlink') content = <><path d="M9 15 7 17a4 4 0 0 1-6-6l3-3a4 4 0 0 1 6 0M15 9l2-2a4 4 0 0 1 6 6l-3 3a4 4 0 0 1-6 0M8 12h8" />{name === 'unlink' && <path d="M3 3l18 18" />}</>;
  else if (name === 'text-color' || name === 'clear-text-color') content = <><path d="m6 18 6-14 6 14M8 14h8M5 21h14" />{name === 'clear-text-color' && <path d="M4 4l16 16" />}</>;
  else if (name === 'text-style') content = <><text x="8" y="16" textAnchor="middle" stroke="none" fill="currentColor" fontSize="12" fontWeight="700">A</text><path d="M15 6h6M15 12h6M15 18h6" /></>;
  else if (name.startsWith('align-')) content = lines(name.slice(6) as 'left' | 'center' | 'right');
  else if (name === 'justify') content = lines('justify');
  else if (name === 'quote') content = <><path d="M5 6h6v6H7a5 5 0 0 1-3 5M14 6h6v6h-4a5 5 0 0 1-3 5" /></>;
  else if (name === 'bullet-list' || name === 'ordered-list' || name === 'task-list') content = <>{[6, 12, 18].map((y, index) => <g key={y}>{name === 'bullet-list' ? <circle cx="4" cy={y} r="1" fill="currentColor" /> : name === 'ordered-list' ? <text x="4" y={y + 2} textAnchor="middle" stroke="none" fill="currentColor" fontSize="6">{index + 1}</text> : <rect x="2" y={y - 2} width="4" height="4" />}<path d={`M9 ${y}h12`} /></g>)}</>;
  else if (name === 'outdent-list' || name === 'indent-list') content = <><path d="M10 6h11M10 12h11M10 18h11" /><path d={name === 'indent-list' ? 'm2 9 3 3-3 3M5 12H1' : 'm5 9-3 3 3 3M2 12h4'} /></>;
  else if (name.includes('table') || name.includes('cell') || name.includes('header') || name === 'select-row' || name === 'select-column' || name === 'column-width') content = <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" />{name.startsWith('add-') && <path d="M17 2v6M14 5h6" />}{name.startsWith('delete-') && <path d="M14 5h6" />}{name === 'merge-cells' && <path d="m6 12 3-2v4zm12 0-3-2v4z" fill="currentColor" />}{name === 'split-cell' && <path d="m10 12-3-2v4zm4 0 3-2v4z" fill="currentColor" />}{name === 'column-width' && <path d="m6 18-2-2 2-2m12 4 2-2-2-2" />}</>;
  else if (name === 'image' || name === 'upload-image') content = <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m4 18 5-5 3 3 3-4 5 6" />{name === 'upload-image' && <path d="M17 3v7m-3-4 3-3 3 3" />}</>;
  else if (name === 'media') content = <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" fill="currentColor" /></>;
  else if (name === 'upload-asset') content = <><path d="M5 19h14M12 4v11m-4-7 4-4 4 4" /></>;
  else if (name === 'divider') content = <path d="M3 12h18" />;
  else if (name === 'hard-break') content = <path d="M19 5v5a4 4 0 0 1-4 4H5m4-4-4 4 4 4" />;
  else content = <circle cx="12" cy="12" r="7" />;
  return <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    focusable="false"
    aria-hidden="true"
    {...props}
  >{content}</svg>;
}

export interface FountainToolbarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'onMouseDown' | 'onPointerDown' | 'aria-label'> {
  actionId?: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onAction: () => void;
}

/** Focus-preserving command button usable inside the supplied or a custom toolbar. */
export function FountainToolbarButton({ actionId, label, icon, active, onAction, className, ...props }: FountainToolbarButtonProps) {
  const lastPointerType = useRef<string | null>(null);
  const runPointerAction = (event: PointerEvent<HTMLButtonElement>) => {
    lastPointerType.current = event.pointerType || 'mouse';
    if (event.pointerType === 'touch') return;
    event.preventDefault();
    onAction();
  };
  const runKeyboardAction = (event: MouseEvent<HTMLButtonElement>) => {
    const shouldRun = event.detail === 0 || lastPointerType.current === 'touch';
    lastPointerType.current = null;
    if (!shouldRun) return;
    event.preventDefault();
    onAction();
  };
  return <button
    {...props}
    type="button"
    className={['fountain-toolbar__button', className].filter(Boolean).join(' ')}
    data-fountain-toolbar-action={actionId}
    aria-label={label}
    aria-pressed={active}
    title={props.title ?? label}
    onPointerDown={runPointerAction}
    onClick={runKeyboardAction}
  >{icon ?? label}</button>;
}

export interface FountainToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
}

/** Labelled action group for supplied or product-owned toolbar controls. */
export function FountainToolbarGroup({ label, className, children, ...props }: FountainToolbarGroupProps) {
  return <div {...props} className={['fountain-toolbar__group', className].filter(Boolean).join(' ')} role="group" aria-label={label}>{children}</div>;
}

export interface FountainToolbarRootProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

/** Horizontal toolbar root with wrapping arrow/Home/End keyboard traversal. */
export function FountainToolbarRoot({ label = 'Formatting and rich content', className, children, onKeyDown, ...props }: FountainToolbarRootProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([type="file"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
    )];
    if (!controls.length) return;
    const current = Math.max(0, controls.indexOf(document.activeElement as HTMLElement));
    const direction = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1;
    const delta = event.key === 'ArrowRight' ? direction : -direction;
    const target = event.key === 'Home' ? 0
      : event.key === 'End' ? controls.length - 1
        : (current + delta + controls.length) % controls.length;
    event.preventDefault();
    controls[target]?.focus();
  };
  return <div
    {...props}
    className={['fountain-toolbar', className].filter(Boolean).join(' ')}
    role="toolbar"
    aria-label={label}
    aria-orientation="horizontal"
    onKeyDown={handleKeyDown}
  >{children}</div>;
}
