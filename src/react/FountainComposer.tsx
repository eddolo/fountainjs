import { forwardRef } from 'react';
import type { Editor } from '../core';
import { FountainEditor, type FountainEditorHandle, type FountainEditorProps } from './FountainEditor';
import { FountainToolbar } from './FountainToolbar';

export interface FountainComposerProps extends Omit<FountainEditorProps, 'editor'> {
  editor: Editor;
  className?: string;
  showToolbar?: boolean;
}

export const FountainComposer = forwardRef<FountainEditorHandle, FountainComposerProps>(function FountainComposer(
  { editor, className, showToolbar = true, imageUpload, assetUpload, onError, ...editorProps },
  ref,
) {
  return (
    <section className={['fountain-composer', className].filter(Boolean).join(' ')}>
      {showToolbar && <FountainToolbar editor={editor} imageUpload={imageUpload} assetUpload={assetUpload} onError={onError} />}
      <FountainEditor ref={ref} editor={editor} imageUpload={imageUpload} assetUpload={assetUpload} onError={onError} {...editorProps} />
    </section>
  );
});
