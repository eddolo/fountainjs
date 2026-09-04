import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Editor } from '../core';
import {
  type FountainMenuService,
  type FountainMenuSnapshot,
} from '../extensions/floating-menu';
import {
  getEditorMenuAnchorRect,
  placeEditorMenu,
  type EditorMenuPlacementOptions,
} from '../view/menu-position';

export interface FountainContextMenuProps {
  editor: Editor;
  service: FountainMenuService;
  anchorElement?: HTMLElement | null;
  label: string;
  className?: string;
  /** Defaults to true so an eligible menu appears only while its editor or menu has focus. */
  requireFocus?: boolean;
  placementOptions?: EditorMenuPlacementOptions;
  getReferenceRect?: (snapshot: FountainMenuSnapshot, anchorElement: HTMLElement) => DOMRectReadOnly | null;
  children: ReactNode | ((snapshot: FountainMenuSnapshot) => ReactNode);
}

function containsFocus(anchor: HTMLElement | null | undefined, menu: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  return Boolean(active && (anchor?.contains(active) || menu?.contains(active)));
}

function useSurfaceFocus(anchor: HTMLElement | null | undefined, menuRef: { readonly current: HTMLElement | null }) {
  const [focused, setFocused] = useState(() => containsFocus(anchor, menuRef.current));
  useLayoutEffect(() => setFocused(containsFocus(anchor, menuRef.current)), [anchor, menuRef]);
  useEffect(() => {
    let mounted = true;
    const update = () => queueMicrotask(() => {
      if (mounted) setFocused(containsFocus(anchor, menuRef.current));
    });
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      mounted = false;
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [anchor, menuRef]);
  return focused;
}

function FountainContextMenu({
  editor,
  service,
  anchorElement,
  label,
  className,
  requireFocus = true,
  placementOptions,
  getReferenceRect,
  children,
}: FountainContextMenuProps) {
  const controller = service.getController(editor);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const menuRef = useRef<HTMLDivElement>(null);
  const focused = useSurfaceFocus(anchorElement, menuRef);
  const visible = snapshot.open && (!requireFocus || focused);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');

  useLayoutEffect(() => {
    if (!visible || !anchorElement || !menuRef.current) return;
    const update = () => {
      const reference = getReferenceRect
        ? getReferenceRect(snapshot, anchorElement)
        : getEditorMenuAnchorRect(anchorElement, snapshot);
      const menu = menuRef.current?.getBoundingClientRect();
      if (!reference || !menu) {
        setStyle({ position: 'fixed', visibility: 'hidden' });
        return;
      }
      const placement = placeEditorMenu(reference, menu, snapshot.kind, placementOptions);
      setSide(placement.side);
      setStyle({ position: 'fixed', left: placement.left, top: placement.top });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(anchorElement);
    observer?.observe(menuRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [anchorElement, getReferenceRect, placementOptions, snapshot, visible]);

  useEffect(() => {
    if (!visible || !anchorElement) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      controller.dismiss();
    };
    anchorElement.addEventListener('keydown', escape);
    return () => anchorElement.removeEventListener('keydown', escape);
  }, [anchorElement, controller, visible]);

  if (!visible) return null;
  return <div
    ref={menuRef}
    className={['fountain-context-menu', `fountain-${snapshot.kind}-menu`, className].filter(Boolean).join(' ')}
    role="toolbar"
    aria-label={label}
    aria-orientation="horizontal"
    data-side={side}
    style={style}
    onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        controller.dismiss();
        anchorElement?.focus();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )];
      if (!controls.length) return;
      const current = Math.max(0, controls.indexOf(document.activeElement as HTMLElement));
      const target = event.key === 'Home' ? 0
        : event.key === 'End' ? controls.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length;
      event.preventDefault();
      controls[target]?.focus();
    }}
  >
    {typeof children === 'function' ? children(snapshot) : children}
  </div>;
}

export type FountainBubbleMenuProps = Omit<FountainContextMenuProps, 'label'> & { label?: string };
export type FountainFloatingMenuProps = Omit<FountainContextMenuProps, 'label'> & { label?: string };

/** Accessible React surface for a framework-neutral bubble-menu controller. */
export function FountainBubbleMenu({ label = 'Selection actions', ...props }: FountainBubbleMenuProps) {
  if (props.service.kind !== 'bubble') throw new TypeError('FountainBubbleMenu requires a bubble-menu service.');
  return <FountainContextMenu {...props} label={label} />;
}

/** Accessible React surface for a framework-neutral floating-menu controller. */
export function FountainFloatingMenu({ label = 'Empty block actions', ...props }: FountainFloatingMenuProps) {
  if (props.service.kind !== 'floating') throw new TypeError('FountainFloatingMenu requires a floating-menu service.');
  return <FountainContextMenu {...props} label={label} />;
}
