import { useEffect, useRef, useState } from 'react';
import type { Editor } from 'fountainjs-editor';
import { useFountainState } from 'fountainjs-editor/react';
import { openBpmnModeler } from 'fountainjs-editor/diagrams';

export function BpmnCanvasButton({ editor }: { editor: Editor }) {
  const state = useFountainState(editor);
  const close = useRef<() => void>(undefined);
  const [error, setError] = useState('');
  useEffect(() => () => close.current?.(), [editor]);
  if (!state || !editor.editable) return null;
  const path: number[] = [];
  let block = state.doc;
  const selection = state.selection;
  const selectedPath = selection.kind === 'text' ? selection.path : selection.kind === 'node' ? selection.nodePath : [];
  for (const index of selectedPath) {
    if (!block.content[index]) break;
    block = block.child(index);
    path.push(index);
    if (block.type.name === 'code_block') break;
  }
  if (block.type.name !== 'code_block' || block.attrs.language !== 'bpmn') return null;

  return <><button type="button" onMouseDown={event => event.preventDefault()} onClick={async event => {
    const owner = event.currentTarget.ownerDocument;
    try {
      const { modelerOptions } = await import('./bpmn-modeler-assets');
      if (editor.isDestroyed || path.reduce((node, i) => node?.content[i], editor.state.doc as typeof block | undefined) !== block) return;
      close.current?.();
      close.current = openBpmnModeler(editor, path, { ...modelerOptions, owner });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the diagram editor.'); }
  }}>Edit diagram on canvas</button>{error && <span role="alert">{error}</span>}</>;
}
