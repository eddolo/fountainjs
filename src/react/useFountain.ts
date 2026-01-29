import { useState } from 'react';
import { createEditor, Editor, EditorConfig } from '../core';

export function useFountain(config: EditorConfig): Editor | null {
  const [editor] = useState(() => {
    if (!config) return null;
    return createEditor(config);
  });
  return editor;
}