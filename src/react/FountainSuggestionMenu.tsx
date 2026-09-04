import { useEffect, useId, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type {
  SuggestionController,
  SuggestionItemBase,
  SuggestionSnapshot,
} from '../extensions/suggestion';

export interface FountainSuggestionMenuProps<Item extends SuggestionItemBase> {
  controller: SuggestionController<Item>;
  label?: string;
  className?: string;
  emptyMessage?: string;
  /** Editor DOM used to position the menu next to the decorated query. */
  anchorElement?: HTMLElement | null;
  renderItem?: (item: Item, snapshot: SuggestionSnapshot<Item>) => ReactNode;
}

function useSuggestionSnapshot<Item extends SuggestionItemBase>(controller: SuggestionController<Item>) {
  return useSyncExternalStore(
    (notify) => controller.subscribe(() => notify()),
    controller.getSnapshot,
    controller.getSnapshot,
  );
}

function anchorStyle(element: HTMLElement | null | undefined): CSSProperties | undefined {
  const query = element?.querySelector<HTMLElement>('[data-fountain-suggestion-query]');
  if (!query) return undefined;
  const bounds = query.getBoundingClientRect();
  const gap = 7;
  const edge = 8;
  const menuHeight = Math.min(380, window.innerHeight * .55);
  const menuWidth = Math.min(320, window.innerWidth - edge * 2);
  const top = bounds.bottom + gap + menuHeight <= window.innerHeight - edge
    ? bounds.bottom + gap
    : Math.max(edge, bounds.top - gap - menuHeight);
  return {
    position: 'fixed',
    insetBlockStart: top,
    insetInlineStart: Math.max(edge, Math.min(window.innerWidth - menuWidth - edge, bounds.left)),
  };
}

/** Accessible, framework-specific rendering for the headless suggestion controller. */
export function FountainSuggestionMenu<Item extends SuggestionItemBase>({
  controller,
  label = 'Suggestions',
  className,
  emptyMessage = 'No matching suggestions.',
  anchorElement,
  renderItem,
}: FountainSuggestionMenuProps<Item>) {
  const snapshot = useSuggestionSnapshot(controller);
  const [style, setStyle] = useState<CSSProperties | undefined>();
  const listboxId = `fountain-suggestions-${useId().replace(/:/g, '')}`;

  useLayoutEffect(() => {
    if (!snapshot.open) return;
    setStyle(anchorStyle(anchorElement));
  }, [anchorElement, snapshot]);

  useEffect(() => {
    if (!snapshot.open || !anchorElement) return;
    const update = () => setStyle(anchorStyle(anchorElement));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
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
  return (
    <section
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
        {snapshot.items.map((item, index) => <button
          id={`${listboxId}-option-${index}`}
          type="button"
          role="option"
          aria-selected={snapshot.selectedIndex === index}
          aria-disabled={item.disabled || undefined}
          disabled={item.disabled}
          tabIndex={-1}
          key={`${item.id}:${index}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => controller.select(index)}
          onClick={() => controller.accept(index)}
        >
          {renderItem?.(item, snapshot) ?? item.label}
        </button>)}
      </div>
    </section>
  );
}
