import React from 'react';
import { Editor, Selection } from '../core';
import { useNavigatorState } from './useNavigatorState';

interface NavigatorProps {
  editor: Editor | null;
}

export const Navigator: React.FC<NavigatorProps> = ({ editor }) => {
  const outline = useNavigatorState(editor);
  if (!editor) return null;

  const handleClick = (path: number[]) => {
    const selection = Selection.createCursor(path, 0);
    const tr = editor.createTransaction().setSelection(selection);
    editor.dispatch(tr);
  };

  return (
    <div style={{ padding: '1rem', border: '1px solid #eee', background: '#fcfcfc' }}>
      <h3 style={{ marginTop: 0 }}>Navigator</h3>
      {outline.length === 0 && <p style={{ color: '#999' }}>No headings yet.</p>}
      <ul>
        {outline.map(item => (
          <li
            key={item.id}
            onClick={() => handleClick(item.path)}
            style={{ listStyle: 'none', paddingLeft: `${(item.level - 1) * 20}px`, cursor: 'pointer', marginBottom: '0.5rem', }}
          >
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
};