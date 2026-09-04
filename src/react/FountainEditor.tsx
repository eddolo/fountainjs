import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Editor } from '../core';
import { EditorView, type EditorFocusPosition, type EditorViewOptions } from '../view';

export interface FountainEditorHandle {
  view: EditorView | null;
  focus: (position?: EditorFocusPosition) => void;
}

export interface FountainEditorProps extends EditorViewOptions {
  editor: Editor | null;
  containerClassName?: string;
}

export const FountainEditor = forwardRef<FountainEditorHandle, FountainEditorProps>(function FountainEditor(
  { editor, containerClassName, ariaLabel, className, placeholder, attributes, imageUpload, assetUpload, maxInlineImageBytes, blockHandles, onError },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    get view() { return viewRef.current; },
    focus: (position) => viewRef.current?.focus(position),
  }), [editor]);

  useEffect(() => {
    if (!editor || !mountRef.current) return;
    const view = new EditorView(mountRef.current, editor, {
      ariaLabel, className, placeholder, attributes, imageUpload, assetUpload, maxInlineImageBytes, blockHandles, onError,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [editor, ariaLabel, className, placeholder, attributes, imageUpload, assetUpload, maxInlineImageBytes, blockHandles, onError]);

  return <div className={containerClassName} data-fountain-root ref={mountRef} />;
});
