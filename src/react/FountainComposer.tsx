import type { Editor } from '../core';
import { FountainEditor, type FountainEditorProps } from './FountainEditor';
import { FountainToolbar } from './FountainToolbar';

export interface FountainComposerProps extends Omit<FountainEditorProps, 'editor'> {
  editor: Editor;
  className?: string;
  showToolbar?: boolean;
}

export function FountainComposer({ editor, className, showToolbar = true, imageUpload, assetUpload, onError, ...editorProps }: FountainComposerProps) {
  return (
    <section className={['fountain-composer', className].filter(Boolean).join(' ')}>
      {showToolbar && <FountainToolbar editor={editor} imageUpload={imageUpload} assetUpload={assetUpload} onError={onError} />}
      <FountainEditor editor={editor} imageUpload={imageUpload} assetUpload={assetUpload} onError={onError} {...editorProps} />
    </section>
  );
}
