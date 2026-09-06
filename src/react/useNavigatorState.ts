import { useMemo } from 'react';
import type { Editor } from '../core';
import {
  buildTableOfContents,
  tableOfContentsKey,
  type TableOfContentsEntry,
  type TableOfContentsState,
} from '../table-of-contents';
import { useFountainState } from './useFountain';

export interface OutlineItem extends Omit<TableOfContentsEntry, 'title' | 'path'> {
  text: string;
  path: number[];
}

export interface NavigatorState {
  readonly entries: readonly OutlineItem[];
  readonly activeId: string | null;
}

const EMPTY_NAVIGATOR_STATE: NavigatorState = Object.freeze({ entries: Object.freeze([]), activeId: null });

/** Live stable table-of-contents state, with a path-based fallback for legacy kits. */
export function useNavigatorTableOfContentsState(editor: Editor | null): NavigatorState {
  const state = useFountainState(editor);
  return useMemo(() => {
    if (!state) return EMPTY_NAVIGATOR_STATE;
    const installed = tableOfContentsKey.get(state);
    const current: TableOfContentsState = installed ?? Object.freeze({
      ...buildTableOfContents(state.doc),
      activeId: null,
    });
    return Object.freeze({
      entries: Object.freeze(current.entries.map((entry) => Object.freeze({
        ...entry,
        text: entry.title,
        path: [...entry.path],
      }))),
      activeId: current.activeId,
    });
  }, [state]);
}

export function useNavigatorState(editor: Editor | null): OutlineItem[] {
  return [...useNavigatorTableOfContentsState(editor).entries];
}
