import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  addTableColumn,
  addTableRow,
  deleteTableColumn,
  deleteTableRow,
  getActiveTableCell,
  getActiveImage,
  insertBlock,
  insertHardBreak,
  insertImage,
  insertInlineImage,
  insertQuote,
  insertTable,
  indentListItem,
  isInsideNode,
  isMarkActive,
  findText,
  outdentListItem,
  replaceAllText,
  selectNextMatch,
  setBlockType,
  setMark,
  setTextAlignment,
  setImageAlignment,
  setImageAttributes,
  deleteImage,
  mergeTableCells,
  resizeTableColumn,
  selectTableColumn,
  selectTableRow,
  splitTableCell,
  toggleTableHeaderCell,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
  toggleMark,
  toggleList,
  unsetMark,
  type Editor,
  CellSelection,
} from '../core';
import { getClipboardHistoryState, openClipboardHistory } from '../extensions/clipboard-history';
import { canRedo, canUndo, redo, undo } from '../extensions/plugins/history';
import { editLink, getActiveLink, removeLink } from '../extensions/link-behavior';
import {
  CODE_BLOCK_LANGUAGES,
  getActiveCodeBlock,
  setCodeBlockLanguage,
  toggleCodeBlockLineNumbers,
} from '../extensions/plugins/syntax-highlight';
import {
  startImageUpload,
  type ImageUploadHandler,
  type ImageUploadSnapshot,
  type ImageUploadTask,
} from '../view/media';
import { useFountainState } from './useFountain';
import { ClipboardHistoryMenu } from './ClipboardHistoryMenu';

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
  const runPointerAction = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onAction();
  };
  const runKeyboardAction = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
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
      onMouseDown={runPointerAction}
      onClick={runKeyboardAction}
    >{label}</button>
  );
}

export function FountainToolbar({ editor, className, extraActions, imageUpload, onError }: FountainToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const languageListId = useId();
  const state = useFountainState(editor);
  const [panel, setPanel] = useState<'link' | 'image' | 'search' | 'code' | 'table' | null>(null);
  const [url, setURL] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkTarget, setLinkTarget] = useState<'_blank' | '_self'>('_blank');
  const [alt, setAlt] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [imageWidth, setImageWidth] = useState('100%');
  const [imageHeight, setImageHeight] = useState('auto');
  const [imageAlign, setImageAlign] = useState<'left' | 'center' | 'right'>('center');
  const [imagePlacement, setImagePlacement] = useState<'block' | 'inline'>('block');
  const [imageSrcset, setImageSrcset] = useState('');
  const [imageSizes, setImageSizes] = useState('');
  const [imageTask, setImageTask] = useState<ImageUploadTask | null>(null);
  const [uploadSnapshot, setUploadSnapshot] = useState<ImageUploadSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('text');
  const [tableWidth, setTableWidth] = useState('120');
  useEffect(() => imageTask?.subscribe(setUploadSnapshot), [imageTask]);
  if (!editor) return null;
  const mark = (name: string) => () => toggleMark(editor, name);
  const activeLink = getActiveLink(editor);
  const activeCodeBlock = getActiveCodeBlock(editor);
  const activeTable = getActiveTableCell(editor);
  const activeImage = getActiveImage(editor);
  const clipboardHistory = getClipboardHistoryState(editor);

  const toggleLinkPanel = () => {
    if (panel === 'link') {
      setPanel(null);
      return;
    }
    setURL(activeLink?.href ?? '');
    setLinkTitle(activeLink?.title ?? '');
    setLinkText(activeLink?.text ?? '');
    setLinkTarget(activeLink?.target ?? '_blank');
    setPanel('link');
  };

  const submitLink = (event: FormEvent) => {
    event.preventDefault();
    if (editLink(editor, url, { title: linkTitle, target: linkTarget, text: linkText })) {
      setURL('');
      setLinkTitle('');
      setLinkText('');
      setLinkTarget('_blank');
      setPanel(null);
    }
  };

  const submitImage = (event: FormEvent) => {
    event.preventDefault();
    const attrs = {
      src: url,
      alt,
      title: imageTitle,
      caption,
      width: imageWidth,
      height: imageHeight,
      align: imageAlign,
      srcset: imageSrcset,
      sizes: imageSizes,
    };
    const accepted = activeImage
      ? setImageAttributes(editor, attrs)
      : imagePlacement === 'inline'
        ? insertInlineImage(editor, attrs)
        : insertImage(editor, attrs);
    if (accepted) {
      setURL('');
      setAlt('');
      setImageTitle('');
      setCaption('');
      setPanel(null);
    }
  };

  const toggleImagePanel = () => {
    if (panel === 'image') {
      setPanel(null);
      return;
    }
    const attrs = activeImage?.node.attrs;
    setURL(String(attrs?.src ?? ''));
    setAlt(String(attrs?.alt ?? ''));
    setImageTitle(String(attrs?.title ?? ''));
    setCaption(String(attrs?.caption ?? ''));
    setImageWidth(String(attrs?.width ?? '100%'));
    setImageHeight(String(attrs?.height ?? 'auto'));
    setImageAlign((attrs?.align as 'left' | 'center' | 'right' | undefined) ?? 'center');
    setImagePlacement(activeImage?.inline ? 'inline' : 'block');
    setImageSrcset(String(attrs?.srcset ?? ''));
    setImageSizes(String(attrs?.sizes ?? ''));
    setPanel('image');
  };

  const toggleCodePanel = () => {
    if (panel === 'code') {
      setPanel(null);
      return;
    }
    if (activeCodeBlock) {
      setCodeLanguage(activeCodeBlock.language);
      setPanel('code');
      return;
    }
    if (insertBlock(editor, 'code_block', { language: 'text', lineNumbers: true })) {
      setCodeLanguage('text');
      setPanel('code');
    }
  };

  const submitCodeLanguage = (event: FormEvent) => {
    event.preventDefault();
    if (setCodeBlockLanguage(editor, codeLanguage)) setPanel(null);
  };

  const chooseImage = async (file?: File) => {
    if (!file) return;
    try {
      const task = startImageUpload(editor, file, {
        upload: imageUpload,
        replacePath: activeImage?.path,
        placement: activeImage ? undefined : imagePlacement,
        alt: alt || undefined,
        title: imageTitle || undefined,
        caption: caption || undefined,
        width: imageWidth,
        height: imageHeight,
        align: imageAlign,
        srcset: imageSrcset,
        sizes: imageSizes,
      });
      setImageTask(task);
      setPanel('image');
      void task.completion.catch((error) => onError?.(error));
    } catch (error) { onError?.(error); }
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="fountain-toolbar-wrap">
      <div className={['fountain-toolbar', className].filter(Boolean).join(' ')} role="toolbar" aria-label="Formatting and rich content">
        <div className="fountain-toolbar__group" aria-label="History">
          <ToolButton label="↶" title="Undo" disabled={!canUndo(editor)} onAction={() => undo(editor)} />
          <ToolButton label="↷" title="Redo" disabled={!canRedo(editor)} onAction={() => redo(editor)} />
          <ToolButton label="⌕" title="Find and replace" onAction={() => setPanel(panel === 'search' ? null : 'search')} />
          {clipboardHistory && <ToolButton label="Clip" title="Clipboard history (Ctrl/Command+Alt+V)" active={clipboardHistory.open} onAction={() => openClipboardHistory(editor)} />}
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
          <ToolButton label="↗" title="Add or edit link" active={Boolean(activeLink) || isMarkActive(editor, 'link')} onAction={toggleLinkPanel} />
          <ToolButton label="×↗" title="Remove link" disabled={!activeLink && !isMarkActive(editor, 'link')} onAction={() => removeLink(editor)} />
          <label className="fountain-toolbar__color" title="Text color">
            <span>A</span>
            <input aria-label="Text color" type="color" defaultValue="#171923" onChange={(event) => setMark(editor, 'text_color', { color: event.target.value })} />
          </label>
          <ToolButton label="A×" title="Remove text color" disabled={!isMarkActive(editor, 'text_color')} onAction={() => unsetMark(editor, 'text_color')} />
        </div>
        <div className="fountain-toolbar__group" aria-label="Alignment">
          <ToolButton label="≡←" title="Align left" active={activeImage?.node.attrs.align === 'left'} onAction={() => activeImage ? setImageAlignment(editor, 'left') : setTextAlignment(editor, 'left')} />
          <ToolButton label="≡" title="Align center" active={activeImage?.node.attrs.align === 'center'} onAction={() => activeImage ? setImageAlignment(editor, 'center') : setTextAlignment(editor, 'center')} />
          <ToolButton label="→≡" title="Align right" active={activeImage?.node.attrs.align === 'right'} onAction={() => activeImage ? setImageAlignment(editor, 'right') : setTextAlignment(editor, 'right')} />
          <ToolButton label="☰" title="Justify" onAction={() => setTextAlignment(editor, 'justify')} />
        </div>
        <div className="fountain-toolbar__group" aria-label="Insert blocks">
          <ToolButton label="❝" title="Quote" onAction={() => insertQuote(editor)} />
          <ToolButton label="• List" title="Bullet list" active={isInsideNode(editor, 'bullet_list')} onAction={() => toggleList(editor, 'bullet')} />
          <ToolButton label="1. List" title="Numbered list" active={isInsideNode(editor, 'ordered_list')} onAction={() => toggleList(editor, 'ordered')} />
          <ToolButton label="☑" title="Task list" active={isInsideNode(editor, 'task_list')} onAction={() => toggleList(editor, 'task')} />
          <ToolButton label="⇤" title="Lift list item" disabled={!isInsideNode(editor, 'list_item') && !isInsideNode(editor, 'task_item')} onAction={() => outdentListItem(editor)} />
          <ToolButton label="⇥" title="Indent list item" disabled={!isInsideNode(editor, 'list_item') && !isInsideNode(editor, 'task_item')} onAction={() => indentListItem(editor)} />
          <ToolButton label="{ }" title="Code block and language" active={Boolean(activeCodeBlock)} onAction={toggleCodePanel} />
          <ToolButton label="▦" title="Insert 3 by 3 table" onAction={() => insertTable(editor)} />
          <ToolButton label="IMG" title={activeImage ? 'Edit selected image' : 'Insert image from URL'} active={Boolean(activeImage)} onAction={toggleImagePanel} />
          <ToolButton label="↑IMG" title={activeImage ? 'Replace selected image' : 'Upload image'} onAction={() => fileInput.current?.click()} />
          <ToolButton label="—" title="Divider" onAction={() => insertBlock(editor, 'horizontal_rule')} />
          <ToolButton label="↵" title="Line break" onAction={() => insertHardBreak(editor)} />
        </div>
        <div className="fountain-toolbar__group" aria-label="Edit table">
          <ToolButton label="+Row" title="Add table row" disabled={!isInsideNode(editor, 'table')} onAction={() => addTableRow(editor)} />
          <ToolButton label="−Row" title="Delete table row" disabled={!isInsideNode(editor, 'table')} onAction={() => deleteTableRow(editor)} />
          <ToolButton label="+Col" title="Add table column" disabled={!isInsideNode(editor, 'table')} onAction={() => addTableColumn(editor)} />
          <ToolButton label="−Col" title="Delete table column" disabled={!isInsideNode(editor, 'table')} onAction={() => deleteTableColumn(editor)} />
          <ToolButton label="Merge" title="Merge selected table cells" disabled={!(editor.state.selection instanceof CellSelection) || editor.state.selection.cellPaths.length < 2} onAction={() => mergeTableCells(editor)} />
          <ToolButton label="Split" title="Split merged table cell" disabled={!activeTable || (activeTable.cell.colspan === 1 && activeTable.cell.rowspan === 1)} onAction={() => splitTableCell(editor)} />
          <ToolButton label="H·Row" title="Toggle header row" disabled={!activeTable} onAction={() => toggleTableHeaderRow(editor)} />
          <ToolButton label="H·Col" title="Toggle header column" disabled={!activeTable} onAction={() => toggleTableHeaderColumn(editor)} />
          <ToolButton label="H·Cell" title="Toggle header cell" disabled={!activeTable} onAction={() => toggleTableHeaderCell(editor)} />
          <ToolButton label="Sel Row" title="Select table row" disabled={!activeTable} onAction={() => selectTableRow(editor)} />
          <ToolButton label="Sel Col" title="Select table column" disabled={!activeTable} onAction={() => selectTableColumn(editor)} />
          <ToolButton label="↔" title="Set table column width" disabled={!activeTable} onAction={() => {
            const width = activeTable?.map.columnWidth(activeTable.cell.column) ?? 120;
            setTableWidth(String(width));
            setPanel(panel === 'table' ? null : 'table');
          }} />
        </div>
        {extraActions}
        <input ref={fileInput} className="fountain-toolbar__file" type="file" accept="image/*" onChange={(event) => void chooseImage(event.target.files?.[0])} />
      </div>
      {panel === 'link' && <form className="fountain-toolbar__popover is-link" onSubmit={submitLink}>
        <strong>{activeLink ? 'Edit link' : 'Add link'}</strong>
        <input aria-label="Link URL" required inputMode="url" placeholder="https://example.com, /page, or mail@example.com" value={url} onChange={(event) => setURL(event.target.value)} />
        {!activeLink && editor.state.selection.isCollapsed && <input aria-label="Link text" required placeholder="Visible link text" value={linkText} onChange={(event) => setLinkText(event.target.value)} />}
        <input aria-label="Link title" placeholder="Title (optional)" value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} />
        <select aria-label="Link destination" value={linkTarget} onChange={(event) => setLinkTarget(event.target.value as '_blank' | '_self')}>
          <option value="_blank">Open in a new tab</option>
          <option value="_self">Open in this tab</option>
        </select>
        {activeLink && <a className="fountain-toolbar__link-preview" href={activeLink.href} target={activeLink.target} rel={activeLink.target === '_blank' ? 'noopener noreferrer' : undefined}>Open current link</a>}
        <button type="submit">{activeLink ? 'Save link' : 'Apply link'}</button>
        {activeLink && <button type="button" onClick={() => { removeLink(editor); setPanel(null); }}>Remove link</button>}
        <button type="button" onClick={() => setPanel(null)}>Cancel</button>
      </form>}
      {panel === 'image' && <form className="fountain-toolbar__popover is-image" onSubmit={submitImage}>
        <strong>{activeImage ? 'Edit image' : 'Add image'}</strong>
        {!activeImage && <select aria-label="Image placement" value={imagePlacement} onChange={(event) => {
          const placement = event.target.value as 'block' | 'inline';
          setImagePlacement(placement);
          setImageWidth(placement === 'inline' ? 'auto' : '100%');
          setImageHeight(placement === 'inline' ? '1em' : 'auto');
        }}>
          <option value="block">Block image</option>
          <option value="inline">Inline with text</option>
        </select>}
        <input aria-label="Image URL" required inputMode="url" placeholder="https://example.com/image.jpg" value={url} onChange={(event) => setURL(event.target.value)} />
        <input aria-label="Alternative text" placeholder="Alternative text" value={alt} onChange={(event) => setAlt(event.target.value)} />
        <input aria-label="Image title" placeholder="Title (optional)" value={imageTitle} onChange={(event) => setImageTitle(event.target.value)} />
        {!activeImage?.inline && imagePlacement === 'block' && <textarea aria-label="Image caption" placeholder="Caption (optional)" value={caption} onChange={(event) => setCaption(event.target.value)} />}
        <label>Width <input aria-label="Image width" required placeholder="100% or 640px" value={imageWidth} onChange={(event) => setImageWidth(event.target.value)} /></label>
        <label>Height <input aria-label="Image height" required placeholder="auto" value={imageHeight} onChange={(event) => setImageHeight(event.target.value)} /></label>
        {!activeImage?.inline && imagePlacement === 'block' && <select aria-label="Image alignment" value={imageAlign} onChange={(event) => setImageAlign(event.target.value as 'left' | 'center' | 'right')}>
          <option value="left">Align left</option>
          <option value="center">Align center</option>
          <option value="right">Align right</option>
        </select>}
        <details>
          <summary>Responsive sources</summary>
          <input aria-label="Image source set" placeholder="small.jpg 480w, large.jpg 1200w" value={imageSrcset} onChange={(event) => setImageSrcset(event.target.value)} />
          <input aria-label="Image sizes" placeholder="(max-width: 600px) 100vw, 600px" value={imageSizes} onChange={(event) => setImageSizes(event.target.value)} />
        </details>
        <div className="fountain-toolbar__image-actions">
          <button type="submit">{activeImage ? 'Save image' : 'Insert URL'}</button>
          <button type="button" onClick={() => fileInput.current?.click()}>{activeImage ? 'Replace file' : 'Choose file'}</button>
          {activeImage && <button type="button" onClick={() => { deleteImage(editor); setPanel(null); }}>Delete image</button>}
          <button type="button" onClick={() => setPanel(null)}>Close</button>
        </div>
        {uploadSnapshot && <div className="fountain-image-upload" role="status" aria-live="polite">
          <span>{uploadSnapshot.status === 'uploading'
            ? `Uploading ${uploadSnapshot.fileName}: ${Math.round(uploadSnapshot.progress * 100)}%`
            : uploadSnapshot.status === 'succeeded'
              ? `${uploadSnapshot.fileName} inserted`
              : uploadSnapshot.status === 'cancelled'
                ? `${uploadSnapshot.fileName} cancelled`
                : `Upload failed: ${uploadSnapshot.error instanceof Error ? uploadSnapshot.error.message : 'Unknown error'}`}</span>
          {uploadSnapshot.status === 'uploading' && <>
            <progress max="1" value={uploadSnapshot.progress} />
            <button type="button" onClick={() => imageTask?.cancel()}>Cancel upload</button>
          </>}
          {uploadSnapshot.status === 'failed' && <button type="button" onClick={() => void imageTask?.retry().catch((error) => onError?.(error))}>Retry upload</button>}
        </div>}
      </form>}
      {panel === 'code' && <form className="fountain-toolbar__popover is-code" onSubmit={submitCodeLanguage}>
        <strong>Code block</strong>
        <input
          aria-label="Code language"
          required
          list={languageListId}
          maxLength={50}
          pattern="[A-Za-z0-9_.+#-]+"
          placeholder="Language, for example typescript"
          value={codeLanguage}
          onChange={(event) => setCodeLanguage(event.target.value)}
        />
        <datalist id={languageListId}>
          {CODE_BLOCK_LANGUAGES.map((language) => <option key={language} value={language} />)}
        </datalist>
        <label className="fountain-toolbar__check">
          <input
            aria-label="Show code line numbers"
            type="checkbox"
            checked={activeCodeBlock?.lineNumbers ?? true}
            onChange={(event) => toggleCodeBlockLineNumbers(editor, event.target.checked)}
          />
          Line numbers
        </label>
        <button type="submit">Apply</button>
        <button type="button" onClick={() => setPanel(null)}>Cancel</button>
      </form>}
      {panel === 'table' && <form className="fountain-toolbar__popover is-table" onSubmit={(event) => {
        event.preventDefault();
        if (resizeTableColumn(editor, Number(tableWidth))) setPanel(null);
      }}>
        <strong>Column width</strong>
        <input aria-label="Table column width" required type="number" min="40" max="2000" step="1" value={tableWidth} onChange={(event) => setTableWidth(event.target.value)} />
        <span>px</span>
        <button type="submit">Apply</button>
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
      <ClipboardHistoryMenu editor={editor} />
    </div>
  );
}
