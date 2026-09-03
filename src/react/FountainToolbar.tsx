import { useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  addTableColumn,
  addTableRow,
  deleteTableColumn,
  deleteTableRow,
  insertBlock,
  insertHardBreak,
  insertImage,
  insertList,
  insertQuote,
  insertTable,
  isInsideNode,
  isMarkActive,
  findText,
  replaceAllText,
  selectNextMatch,
  setBlockType,
  setLink,
  setMark,
  setTextAlignment,
  toggleMark,
  unsetLink,
  unsetMark,
  type Editor,
} from '../core';
import { canRedo, canUndo, redo, undo } from '../extensions/plugins/history';
import { insertImageFile, type ImageUploadHandler } from '../view/media';
import { useFountainState } from './useFountain';

export interface FountainToolbarProps {
  editor: Editor | null;
  className?: string;
  extraActions?: ReactNode;
  imageUpload?: ImageUploadHandler;
  onError?: (error: unknown) => void;
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

export function FountainToolbar({ editor, className, extraActions, imageUpload, onError }: FountainToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const state = useFountainState(editor);
  const [panel, setPanel] = useState<'link' | 'image' | 'search' | null>(null);
  const [url, setURL] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  if (!editor) return null;
  const mark = (name: string) => () => toggleMark(editor, name);

  const submitLink = (event: FormEvent) => {
    event.preventDefault();
    if (setLink(editor, url)) {
      setURL('');
      setPanel(null);
    }
  };

  const submitImage = (event: FormEvent) => {
    event.preventDefault();
    if (insertImage(editor, { src: url, alt, caption })) {
      setURL('');
      setAlt('');
      setCaption('');
      setPanel(null);
    }
  };

  const chooseImage = async (file?: File) => {
    if (!file) return;
    try { await insertImageFile(editor, file, { upload: imageUpload }); }
    catch (error) { onError?.(error); }
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="fountain-toolbar-wrap">
      <div className={['fountain-toolbar', className].filter(Boolean).join(' ')} role="toolbar" aria-label="Formatting and rich content">
        <div className="fountain-toolbar__group" aria-label="History">
          <ToolButton label="↶" title="Undo" disabled={!canUndo(editor)} onAction={() => undo(editor)} />
          <ToolButton label="↷" title="Redo" disabled={!canRedo(editor)} onAction={() => redo(editor)} />
          <ToolButton label="⌕" title="Find and replace" onAction={() => setPanel(panel === 'search' ? null : 'search')} />
        </div>
        <div className="fountain-toolbar__group" aria-label="Text styles">
          <ToolButton label="P" title="Paragraph" onAction={() => setBlockType(editor, 'paragraph')} />
          <ToolButton label="H1" title="Heading 1" onAction={() => setBlockType(editor, 'heading', { level: 1 })} />
          <ToolButton label="H2" title="Heading 2" onAction={() => setBlockType(editor, 'heading', { level: 2 })} />
          <ToolButton label="H3" title="Heading 3" onAction={() => setBlockType(editor, 'heading', { level: 3 })} />
          <ToolButton label="B" title="Bold" active={isMarkActive(editor, 'strong')} onAction={mark('strong')} />
          <ToolButton label="I" title="Italic" active={isMarkActive(editor, 'em')} onAction={mark('em')} />
          <ToolButton label="U" title="Underline" active={isMarkActive(editor, 'underline')} onAction={mark('underline')} />
          <ToolButton label="S" title="Strikethrough" active={isMarkActive(editor, 'strike')} onAction={mark('strike')} />
          <ToolButton label="&lt;/&gt;" title="Inline code" active={isMarkActive(editor, 'code')} onAction={mark('code')} />
          <ToolButton label="HL" title="Highlight" active={isMarkActive(editor, 'highlight')} onAction={mark('highlight')} />
          <ToolButton label="X₂" title="Subscript" active={isMarkActive(editor, 'subscript')} onAction={mark('subscript')} />
          <ToolButton label="X²" title="Superscript" active={isMarkActive(editor, 'superscript')} onAction={mark('superscript')} />
          <ToolButton label="↗" title="Add or edit link" active={isMarkActive(editor, 'link')} onAction={() => setPanel(panel === 'link' ? null : 'link')} />
          <ToolButton label="×↗" title="Remove link" disabled={!isMarkActive(editor, 'link')} onAction={() => unsetLink(editor)} />
          <label className="fountain-toolbar__color" title="Text color">
            <span>A</span>
            <input aria-label="Text color" type="color" defaultValue="#171923" onChange={(event) => setMark(editor, 'text_color', { color: event.target.value })} />
          </label>
          <ToolButton label="A×" title="Remove text color" disabled={!isMarkActive(editor, 'text_color')} onAction={() => unsetMark(editor, 'text_color')} />
        </div>
        <div className="fountain-toolbar__group" aria-label="Alignment">
          <ToolButton label="≡←" title="Align left" onAction={() => setTextAlignment(editor, 'left')} />
          <ToolButton label="≡" title="Align center" onAction={() => setTextAlignment(editor, 'center')} />
          <ToolButton label="→≡" title="Align right" onAction={() => setTextAlignment(editor, 'right')} />
          <ToolButton label="☰" title="Justify" onAction={() => setTextAlignment(editor, 'justify')} />
        </div>
        <div className="fountain-toolbar__group" aria-label="Insert blocks">
          <ToolButton label="❝" title="Quote" onAction={() => insertQuote(editor)} />
          <ToolButton label="• List" title="Bullet list" onAction={() => insertList(editor, 'bullet')} />
          <ToolButton label="1. List" title="Numbered list" onAction={() => insertList(editor, 'ordered')} />
          <ToolButton label="☑" title="Task list" onAction={() => insertList(editor, 'task')} />
          <ToolButton label="{ }" title="Code block" onAction={() => insertBlock(editor, 'code_block', { language: 'text', lineNumbers: true })} />
          <ToolButton label="▦" title="Insert 3 by 3 table" onAction={() => insertTable(editor)} />
          <ToolButton label="IMG" title="Insert image from URL" onAction={() => setPanel(panel === 'image' ? null : 'image')} />
          <ToolButton label="↑IMG" title="Upload image" onAction={() => fileInput.current?.click()} />
          <ToolButton label="—" title="Divider" onAction={() => insertBlock(editor, 'horizontal_rule')} />
          <ToolButton label="↵" title="Line break" onAction={() => insertHardBreak(editor)} />
        </div>
        <div className="fountain-toolbar__group" aria-label="Edit table">
          <ToolButton label="+Row" title="Add table row" disabled={!isInsideNode(editor, 'table')} onAction={() => addTableRow(editor)} />
          <ToolButton label="−Row" title="Delete table row" disabled={!isInsideNode(editor, 'table')} onAction={() => deleteTableRow(editor)} />
          <ToolButton label="+Col" title="Add table column" disabled={!isInsideNode(editor, 'table')} onAction={() => addTableColumn(editor)} />
          <ToolButton label="−Col" title="Delete table column" disabled={!isInsideNode(editor, 'table')} onAction={() => deleteTableColumn(editor)} />
        </div>
        {extraActions}
        <input ref={fileInput} className="fountain-toolbar__file" type="file" accept="image/*" onChange={(event) => void chooseImage(event.target.files?.[0])} />
      </div>
      {panel === 'link' && <form className="fountain-toolbar__popover" onSubmit={submitLink}>
        <strong>Add link to the selection</strong>
        <input aria-label="Link URL" required type="url" placeholder="https://example.com" value={url} onChange={(event) => setURL(event.target.value)} />
        <button type="submit">Apply link</button>
        <button type="button" onClick={() => setPanel(null)}>Cancel</button>
      </form>}
      {panel === 'image' && <form className="fountain-toolbar__popover is-image" onSubmit={submitImage}>
        <strong>Insert an image</strong>
        <input aria-label="Image URL" required type="url" placeholder="https://example.com/image.jpg" value={url} onChange={(event) => setURL(event.target.value)} />
        <input aria-label="Alternative text" placeholder="Alternative text" value={alt} onChange={(event) => setAlt(event.target.value)} />
        <input aria-label="Image caption" placeholder="Caption (optional)" value={caption} onChange={(event) => setCaption(event.target.value)} />
        <button type="submit">Insert image</button>
        <button type="button" onClick={() => setPanel(null)}>Cancel</button>
      </form>}
      {panel === 'search' && <form className="fountain-toolbar__popover is-search" onSubmit={(event) => { event.preventDefault(); selectNextMatch(editor, query); }}>
        <strong>{query ? `${findText(state?.doc ?? editor.state.doc, query).length} matches` : 'Find in document'}</strong>
        <input aria-label="Find text" required placeholder="Find" value={query} onChange={(event) => setQuery(event.target.value)} />
        <input aria-label="Replacement text" placeholder="Replace with" value={replacement} onChange={(event) => setReplacement(event.target.value)} />
        <button type="submit">Find next</button>
        <button type="button" onClick={() => replaceAllText(editor, query, replacement)}>Replace all</button>
        <button type="button" onClick={() => setPanel(null)}>Close</button>
      </form>}
    </div>
  );
}
