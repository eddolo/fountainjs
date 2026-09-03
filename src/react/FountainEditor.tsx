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
  { editor, containerClassName, ariaLabel, className, placeholder, attributes, imageUpload, maxInlineImageBytes, onError },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    get view() { return viewRef.current; },
    focus: () => viewRef.current?.focus(),
  }), [editor]);

  useEffect(() => {
    if (!editor || !mountRef.current) return;
    const view = new EditorView(mountRef.current, editor, {
      ariaLabel, className, placeholder, attributes, imageUpload, maxInlineImageBytes, onError,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [editor, ariaLabel, className, placeholder, attributes, imageUpload, maxInlineImageBytes, onError]);

  return <div className={containerClassName} data-fountain-root ref={mountRef} />;
});
