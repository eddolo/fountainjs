import { useRef } from 'react';
import type { Editor } from '../core';
import { navigateTableOfContents } from '../table-of-contents';
import { useNavigatorTableOfContentsState } from './useNavigatorState';

export interface NavigatorProps { editor: Editor | null; className?: string; }

export function Navigator({ editor, className }: NavigatorProps) {
  const navigation = useNavigatorTableOfContentsState(editor);
  const root = useRef<HTMLElement>(null);
  if (!editor) return null;
  const select = (id: string, anchor: string) => {
    if (!navigateTableOfContents(editor, id)) return;
    const ownerDocument = root.current?.ownerDocument;
    ownerDocument?.getElementById(anchor)?.scrollIntoView({ block: 'nearest' });
  };
  return (
    <nav ref={root} className={['fountain-navigator', className].filter(Boolean).join(' ')} aria-label="Document outline">
      <div className="fountain-navigator__title">Outline</div>
      {navigation.entries.length === 0 ? <p className="fountain-navigator__empty">Add a heading to build an outline.</p> : navigation.entries.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.text}
          aria-current={item.id === navigation.activeId ? 'location' : undefined}
          data-depth={item.depth}
          style={{ paddingInlineStart: `${item.depth * 12 + 8}px` }}
          onClick={() => select(item.id, item.anchor)}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}
