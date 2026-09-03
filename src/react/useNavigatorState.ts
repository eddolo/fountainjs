import { useMemo } from 'react';
import type { Editor, Node as FountainNode } from '../core';
import { useFountainState } from './useFountain';

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  path: number[];
}

export function useNavigatorState(editor: Editor | null): OutlineItem[] {
  const state = useFountainState(editor);
  return useMemo(() => {
    const headings: OutlineItem[] = [];
    state?.doc.descendants((node: FountainNode, path) => {
      if (node.type.name === 'heading') {
        headings.push({ id: path.join('-'), level: Number(node.attrs.level) || 1, text: node.textContent || 'Untitled', path });
      }
    });
    return headings;
  }, [state]);
}
