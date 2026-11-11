import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type {
  SuggestionController,
  SuggestionItemBase,
  SuggestionSnapshot,
} from '../extensions/suggestion';
import { placeEditorMenu } from '../view/menu-position';

export interface FountainSuggestionMenuProps<Item extends SuggestionItemBase> {
  controller: SuggestionController<Item>;
  label?: string;
  className?: string;
  emptyMessage?: string;
  /** Editor DOM used to position the menu next to the decorated query. */
  anchorElement?: HTMLElement | null;
  groupBy?: (item: Item) => string | undefined;
  renderItem?: (item: Item, snapshot: SuggestionSnapshot<Item>) => ReactNode;
}

function useSuggestionSnapshot<Item extends SuggestionItemBase>(controller: SuggestionController<Item>) {
  return useSyncExternalStore(
    (notify) => controller.subscribe(() => notify()),
    controller.getSnapshot,
    controller.getSnapshot,
  );
}

function anchorStyle(element: HTMLElement | null | undefined, menu: HTMLElement | null): CSSProperties | undefined {
  const query = element?.querySelector<HTMLElement>('[data-fountain-suggestion-query]');
  if (!query || !menu) return undefined;
  const viewport = query.ownerDocument.documentElement;
  const { left, top } = placeEditorMenu(query.getBoundingClientRect(), menu.getBoundingClientRect(), 'floating', {
    gap: 7, viewportWidth: viewport.clientWidth, viewportHeight: viewport.clientHeight,
  });
  return { position: 'fixed', left, top };
}

function revealActiveOption(menu: HTMLElement | null): void {
  const option = menu?.querySelector('[role="option"][aria-selected="true"]');
  if (!menu || !option) return;
  // Scroll only this picker. Moving an ancestor can put the editing caret out of view.
  const top = menu.getBoundingClientRect().top + menu.clientTop;
  const bottom = top + menu.clientHeight;
  const bounds = option.getBoundingClientRect();
  if (bounds.top < top) menu.scrollTop += Math.floor(bounds.top - top);
  else if (bounds.bottom > bottom) menu.scrollTop += Math.ceil(bounds.bottom - bottom);
}

/** Accessible, framework-specific rendering for the headless suggestion controller. */
export function FountainSuggestionMenu<Item extends SuggestionItemBase>({
  controller,
  label = 'Suggestions',
  className,
  emptyMessage = 'No matching suggestions.',
  anchorElement,
  groupBy,
  renderItem,
}: FountainSuggestionMenuProps<Item>) {
  const snapshot = useSuggestionSnapshot(controller);
  const [style, setStyle] = useState<CSSProperties | undefined>();
  const menu = useRef<HTMLElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const listboxId = `fountain-suggestions-${useId().replace(/:/g, '')}`;

  useLayoutEffect(() => {
    if (!snapshot.open) return;
    setStyle(anchorStyle(anchorElement, menu.current));
    revealActiveOption(menu.current);
  }, [anchorElement, snapshot]);

  useEffect(() => {
    const viewport = anchorElement?.ownerDocument.defaultView;
    if (!snapshot.open || !viewport) return;
    const update = (event: Event) => {
      if (event.target !== menu.current) setStyle(anchorStyle(anchorElement, menu.current));
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update, true);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update, true);
    };
  }, [anchorElement, snapshot.open]);

  useEffect(() => {
    if (!snapshot.open || !anchorElement) return;
    const names = ['aria-autocomplete', 'aria-controls', 'aria-expanded', 'aria-haspopup', 'aria-activedescendant'] as const;
    const previous = new Map(names.map((name) => [name, anchorElement.getAttribute(name)]));
    anchorElement.setAttribute('aria-autocomplete', 'list');
    anchorElement.setAttribute('aria-controls', listboxId);
    anchorElement.setAttribute('aria-expanded', 'true');
    anchorElement.setAttribute('aria-haspopup', 'listbox');
    if (snapshot.selectedIndex >= 0) {
      anchorElement.setAttribute('aria-activedescendant', `${listboxId}-option-${snapshot.selectedIndex}`);
    } else anchorElement.removeAttribute('aria-activedescendant');
    return () => names.forEach((name) => {
      const value = previous.get(name);
      if (value === null || value === undefined) anchorElement.removeAttribute(name);
      else anchorElement.setAttribute(name, value);
    });
  }, [anchorElement, listboxId, snapshot.open, snapshot.selectedIndex]);

  if (!snapshot.open) return null;
  const indexedItems = snapshot.items.map((item, index) => ({ item, index }));
  const groups = groupBy ? indexedItems.reduce<Array<{
    label: string;
    entries: typeof indexedItems;
  }>>((result, entry) => {
    const label = groupBy(entry.item) ?? '';
    const existing = result.at(-1);
    if (existing?.label === label) existing.entries.push(entry);
    else result.push({ label, entries: [entry] });
    return result;
  }, []) : [{ label: '', entries: indexedItems }];
  const option = (item: Item, index: number) => <button
    id={`${listboxId}-option-${index}`}
    type="button"
    role="option"
    aria-selected={snapshot.selectedIndex === index}
    aria-disabled={item.disabled || undefined}
    disabled={item.disabled}
    tabIndex={-1}
    key={`${item.id}:${index}`}
    onMouseDown={(event) => event.preventDefault()}
    onPointerMove={(event) => {
      if (event.pointerType === 'touch') return;
      const { clientX: x, clientY: y } = event;
      // WebKit can redispatch pointer movement as the list scrolls under it.
      if (pointer.current?.x === x && pointer.current?.y === y) return;
      pointer.current = { x, y };
      if (snapshot.selectedIndex !== index) controller.select(index);
    }}
    onClick={() => controller.accept(index)}
  >
    {renderItem?.(item, snapshot) ?? item.label}
  </button>;
  return (
    <section
      ref={menu}
      onPointerLeave={() => { pointer.current = null; }}
      className={['fountain-suggestion-menu', className].filter(Boolean).join(' ')}
      data-status={snapshot.status}
      aria-label={label}
      style={style}
    >
      <header>
        <strong>{label}</strong>
        <kbd>↑↓</kbd><kbd>Enter</kbd><kbd>Esc</kbd>
      </header>
      {snapshot.status === 'loading' && <p role="status">Loading suggestions…</p>}
      {snapshot.status === 'error' && <p role="alert">{snapshot.error}</p>}
      {snapshot.status === 'ready' && !snapshot.items.length && <p role="status">{emptyMessage}</p>}
      <div id={listboxId} role="listbox" aria-label={label} aria-busy={snapshot.status === 'loading' || undefined}>
        {groups.map((group, groupIndex) => groupBy ? <div
          role="group"
          aria-labelledby={group.label ? `${listboxId}-group-${groupIndex}` : undefined}
          className="fountain-suggestion-menu__group"
          key={`${group.label}:${groupIndex}`}
        >
          {group.label && <div id={`${listboxId}-group-${groupIndex}`} className="fountain-suggestion-menu__group-label">{group.label}</div>}
          {group.entries.map(({ item, index }) => option(item, index))}
        </div> : group.entries.map(({ item, index }) => option(item, index)))}
      </div>
    </section>
  );
}
