import React, { useEffect, useRef } from 'react';
import { Editor } from '../core';
import { EditorView } from '../view';

interface FountainEditorProps {
  editor: Editor | null;
}

export const FountainEditor: React.FC<FountainEditorProps> = ({ editor }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor || !editorRef.current) { return; }
    const view = new EditorView(editorRef.current, editor);
    return () => { view.destroy(); };
  }, [editor]);

  return <div ref={editorRef} />;
};