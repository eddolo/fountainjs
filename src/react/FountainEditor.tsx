import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Editor } from '../core';
import { EditorView, type EditorViewOptions } from '../view';

export interface FountainEditorHandle {
  view: EditorView | null;
  focus: () => void;
}

export interface FountainEditorProps extends EditorViewOptions {
  editor: Editor | null;
  containerClassName?: string;
}

export const FountainEditor = forwardRef<FountainEditorHandle, FountainEditorProps>(function FountainEditor(
  { editor, containerClassName, ...options },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    view: viewRef.current,
    focus: () => viewRef.current?.focus(),
  }), []);

  useEffect(() => {
    if (!editor || !mountRef.current) return;
    const view = new EditorView(mountRef.current, editor, options);
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [editor]);

  return <div className={containerClassName} data-fountain-root ref={mountRef} />;
});
