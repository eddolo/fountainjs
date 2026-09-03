import { Selection, type Editor } from '../core';
import { useNavigatorState } from './useNavigatorState';

export interface NavigatorProps { editor: Editor | null; className?: string; }

function firstTextPath(editor: Editor, blockPath: readonly number[]): number[] {
  let result = [...blockPath];
  let node = editor.state.doc;
  blockPath.forEach((index) => { node = node.child(index); });
  while (!node.isText && node.childCount) {
    result.push(0);
    node = node.child(0);
  }
  return result;
}

export function Navigator({ editor, className }: NavigatorProps) {
  const outline = useNavigatorState(editor);
  if (!editor) return null;
  const select = (path: readonly number[]) => {
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor(firstTextPath(editor, path), 0)));
  };
  return (
    <nav className={['fountain-navigator', className].filter(Boolean).join(' ')} aria-label="Document outline">
      <div className="fountain-navigator__title">Outline</div>
      {outline.length === 0 ? <p className="fountain-navigator__empty">Add a heading to build an outline.</p> : outline.map((item) => (
        <button key={item.id} type="button" style={{ paddingInlineStart: `${(item.level - 1) * 12 + 8}px` }} onClick={() => select(item.path)}>
          {item.text}
        </button>
      ))}
    </nav>
  );
}
