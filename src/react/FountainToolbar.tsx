import type { MouseEvent, ReactNode } from 'react';
import { insertBlock, isMarkActive, setBlockType, toggleMark, type Editor } from '../core';
import { canRedo, canUndo, redo, undo } from '../extensions/plugins/history';
import { useFountainState } from './useFountain';

export interface FountainToolbarProps {
  editor: Editor | null;
  className?: string;
  extraActions?: ReactNode;
}

interface ToolButtonProps {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onAction: () => void;
}

function ToolButton({ label, title, active, disabled, onAction }: ToolButtonProps) {
  const run = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onAction();
  };
  return (
    <button
      type="button"
      className="fountain-toolbar__button"
      aria-label={title}
      aria-pressed={active}
      title={title}
      disabled={disabled}
      onMouseDown={run}
    >{label}</button>
  );
}

export function FountainToolbar({ editor, className, extraActions }: FountainToolbarProps) {
  useFountainState(editor);
  if (!editor) return null;
  const mark = (name: string) => () => toggleMark(editor, name);
  return (
    <div className={['fountain-toolbar', className].filter(Boolean).join(' ')} role="toolbar" aria-label="Formatting">
      <div className="fountain-toolbar__group" aria-label="History">
        <ToolButton label="↶" title="Undo" disabled={!canUndo(editor)} onAction={() => undo(editor)} />
        <ToolButton label="↷" title="Redo" disabled={!canRedo(editor)} onAction={() => redo(editor)} />
      </div>
      <div className="fountain-toolbar__group" aria-label="Blocks">
        <ToolButton label="P" title="Paragraph" onAction={() => setBlockType(editor, 'paragraph')} />
        <ToolButton label="H1" title="Heading 1" onAction={() => setBlockType(editor, 'heading', { level: 1 })} />
        <ToolButton label="H2" title="Heading 2" onAction={() => setBlockType(editor, 'heading', { level: 2 })} />
        <ToolButton label="{ }" title="Code block" onAction={() => insertBlock(editor, 'code_block', { language: 'text', lineNumbers: true })} />
        <ToolButton label="—" title="Divider" onAction={() => insertBlock(editor, 'horizontal_rule')} />
      </div>
      <div className="fountain-toolbar__group" aria-label="Text formatting">
        <ToolButton label="B" title="Bold" active={isMarkActive(editor, 'strong')} onAction={mark('strong')} />
        <ToolButton label="I" title="Italic" active={isMarkActive(editor, 'em')} onAction={mark('em')} />
        <ToolButton label="U" title="Underline" active={isMarkActive(editor, 'underline')} onAction={mark('underline')} />
        <ToolButton label="S" title="Strikethrough" active={isMarkActive(editor, 'strike')} onAction={mark('strike')} />
      </div>
      {extraActions}
    </div>
  );
}
