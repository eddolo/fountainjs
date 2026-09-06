import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  addTableColumn,
  addTableRow,
  deleteTableColumn,
  deleteTableRow,
  deleteTable,
  getActiveTableCell,
  getActiveImage,
  insertBlock,
  insertHardBreak,
  insertImage,
  insertInlineImage,
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
  toggleQuote,
  toggleList,
  unsetMark,
  type Editor,
  CellSelection,
  NodeSelection,
} from '../core';
import { getClipboardHistoryState, openClipboardHistory } from '../extensions/clipboard-history';
import { canRedo, canUndo, redo, undo } from '../extensions/plugins/history';
import { editLink, getActiveLink, removeLink } from '../extensions/link-behavior';
import {
  deleteMedia,
  getActiveMedia,
  insertAudio,
  insertEmbed,
  insertFileAttachment,
  insertVideo,
  setEmbed,
  setMediaAttributes,
  type MediaAlignment,
  type MediaPreload,
} from '../extensions/media';
import {
  CODE_BLOCK_LANGUAGES,
  getActiveCodeBlock,
  setCodeBlockLanguage,
  toggleCodeBlockLineNumbers,
} from '../extensions/plugins/syntax-highlight';
import {
  startAssetUpload,
  startImageUpload,
  type AssetUploadHandler,
  type AssetUploadKind,
  type AssetUploadSnapshot,
  type AssetUploadTask,
  type ImageUploadHandler,
  type ImageUploadSnapshot,
  type ImageUploadTask,
} from '../view/media';
import {
  getActiveTextStyle,
  setBackgroundColor,
  setFontFamily,
  setFontSize,
  setLineHeight,
  setTextColor,
  unsetBackgroundColor,
  unsetFontFamily,
  unsetFontSize,
  unsetLineHeight,
} from '../text-style';
import { useFountainState } from './useFountain';
import { ClipboardHistoryMenu } from './ClipboardHistoryMenu';
import {
  FountainToolbarButton,
  FountainToolbarGroup,
  FountainToolbarIcon,
  FountainToolbarRoot,
  defaultFountainToolbarGroups,
  type FountainToolbarActionId,
  type FountainToolbarGroupId,
} from './FountainToolbarPrimitives';

export interface FountainToolbarActionRenderContext {
  readonly actionId: FountainToolbarActionId;
  readonly label: string;
  readonly defaultControl: ReactNode;
  readonly editor: Editor;
}

export interface FountainToolbarProps {
  editor: Editor | null;
  className?: string;
  extraActions?: ReactNode;
  imageUpload?: ImageUploadHandler;
  assetUpload?: AssetUploadHandler;
  onError?: (error: unknown) => void;
  toolbarLabel?: string;
  groups?: readonly FountainToolbarGroupId[];
  /** Uses one contextual, labelled menu by default; choose expanded for the complete icon row. */
  tableControls?: 'menu' | 'expanded';
  /** Moves listed actions to the front of each group in the supplied order. List every action for an exact order. */
  actionOrder?: Readonly<Partial<Record<FountainToolbarGroupId, readonly FountainToolbarActionId[]>>>;
  hiddenActions?: readonly FountainToolbarActionId[];
  groupLabels?: Readonly<Partial<Record<FountainToolbarGroupId, string>>>;
  actionLabels?: Readonly<Partial<Record<FountainToolbarActionId, string>>>;
  actionIcons?: Readonly<Partial<Record<FountainToolbarActionId, ReactNode>>>;
  renderAction?: (context: FountainToolbarActionRenderContext) => ReactNode;
}

export function FountainToolbar({
  editor,
  className,
  extraActions,
  imageUpload,
  assetUpload,
  onError,
  toolbarLabel = 'Formatting and rich content',
  groups = defaultFountainToolbarGroups,
  tableControls = 'menu',
  actionOrder = {},
  hiddenActions = [],
  groupLabels = {},
  actionLabels = {},
  actionIcons = {},
  renderAction,
}: FountainToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const assetInput = useRef<HTMLInputElement>(null);
  const languageListId = useId();
  const fontFamilyListId = useId();
  const state = useFountainState(editor);
  const [panel, setPanel] = useState<'link' | 'image' | 'media' | 'search' | 'code' | 'insert-table' | 'table' | 'text-style' | 'highlight' | null>(null);
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
  const imageTaskRef = useRef<ImageUploadTask | null>(null);
  const [uploadSnapshot, setUploadSnapshot] = useState<ImageUploadSnapshot | null>(null);
  const [mediaKind, setMediaKind] = useState<AssetUploadKind | 'embed'>('audio');
  const [mediaURL, setMediaURL] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaPoster, setMediaPoster] = useState('');
  const [mediaWidth, setMediaWidth] = useState('100%');
  const [mediaHeight, setMediaHeight] = useState('auto');
  const [mediaAlign, setMediaAlign] = useState<MediaAlignment>('center');
  const [mediaControls, setMediaControls] = useState(true);
  const [mediaAutoplay, setMediaAutoplay] = useState(false);
  const [mediaLoop, setMediaLoop] = useState(false);
  const [mediaMuted, setMediaMuted] = useState(false);
  const [mediaPreload, setMediaPreload] = useState<MediaPreload>('metadata');
  const [mediaPlaysInline, setMediaPlaysInline] = useState(true);
  const [mediaMimeType, setMediaMimeType] = useState('');
  const [mediaFileName, setMediaFileName] = useState('');
  const [mediaDownloadName, setMediaDownloadName] = useState('');
  const [assetTask, setAssetTask] = useState<AssetUploadTask | null>(null);
  const assetTaskRef = useRef<AssetUploadTask | null>(null);
  const [assetSnapshot, setAssetSnapshot] = useState<AssetUploadSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('text');
  const [tableRows, setTableRows] = useState('3');
  const [tableColumns, setTableColumns] = useState('3');
  const [tableWidth, setTableWidth] = useState('120');
  const [fontFamilyValue, setFontFamilyValue] = useState('');
  const [fontSizeValue, setFontSizeValue] = useState('');
  const [lineHeightValue, setLineHeightValue] = useState('');
  const [styleColor, setStyleColor] = useState('#171923');
  const [styleBackground, setStyleBackground] = useState('#fff3a3');
  const [highlightColor, setHighlightColor] = useState('#fff3a3');
  const [textStyleError, setTextStyleError] = useState('');
  useEffect(() => {
    if (!imageTask) return;
    return imageTask.subscribe(setUploadSnapshot);
  }, [imageTask]);
  useEffect(() => {
    if (!assetTask) return;
    return assetTask.subscribe(setAssetSnapshot);
  }, [assetTask]);
  useEffect(() => () => {
    imageTaskRef.current?.cancel();
    assetTaskRef.current?.cancel();
  }, []);
  if (!editor) return null;
  const mark = (name: string) => () => toggleMark(editor, name);
  const activeLink = getActiveLink(editor);
  const activeCodeBlock = getActiveCodeBlock(editor);
  const activeTable = getActiveTableCell(editor);
  const tableSelected = Boolean(activeTable)
    || (editor.state.selection instanceof NodeSelection && editor.state.selection.nodeType === 'table');
  const activeImage = getActiveImage(editor);
  const activeMedia = getActiveMedia(editor);
  const clipboardHistory = getClipboardHistoryState(editor);
  const activeTextStyle = getActiveTextStyle(editor);

  const toggleTextStylePanel = () => {
    if (panel === 'text-style') {
      setPanel(null);
      return;
    }
    setFontFamilyValue(activeTextStyle.fontFamily ?? '');
    setFontSizeValue(activeTextStyle.fontSize ?? '');
    setLineHeightValue(activeTextStyle.lineHeight ?? '');
    setStyleColor(activeTextStyle.color ?? '#171923');
    setStyleBackground(activeTextStyle.backgroundColor ?? '#fff3a3');
    setTextStyleError('');
    setPanel('text-style');
  };

  const applyTextStyle = (label: string, apply: () => boolean) => {
    if (apply()) setTextStyleError('');
    else setTextStyleError(`${label} is invalid for this selection.`);
  };

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
      imageTaskRef.current?.cancel();
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
      imageTaskRef.current = task;
      setImageTask(task);
      setPanel('image');
      void task.completion.catch((error) => onError?.(error));
    } catch (error) { onError?.(error); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const toggleMediaPanel = (preferred: AssetUploadKind | 'embed' = 'audio') => {
    if (panel === 'media') {
      setPanel(null);
      return;
    }
    const attrs = activeMedia?.node.attrs;
    const kind = activeMedia?.kind === 'file_attachment' ? 'file' : activeMedia?.kind ?? preferred;
    setMediaKind(kind);
    setMediaURL(String(attrs?.src ?? ''));
    setMediaTitle(String(attrs?.title ?? ''));
    setMediaCaption(String(attrs?.caption ?? attrs?.description ?? ''));
    setMediaPoster(String(attrs?.poster ?? ''));
    setMediaWidth(String(attrs?.width ?? '100%'));
    setMediaHeight(String(attrs?.height ?? (kind === 'embed' ? '360px' : 'auto')));
    setMediaAlign((attrs?.align as MediaAlignment | undefined) ?? 'center');
    setMediaControls(attrs?.controls !== false);
    setMediaAutoplay(attrs?.autoplay === true);
    setMediaLoop(attrs?.loop === true);
    setMediaMuted(attrs?.muted === true);
    setMediaPreload((attrs?.preload as MediaPreload | undefined) ?? 'metadata');
    setMediaPlaysInline(attrs?.playsInline !== false);
    setMediaMimeType(String(attrs?.mimeType ?? ''));
    setMediaFileName(String(attrs?.name ?? ''));
    setMediaDownloadName(String(attrs?.downloadName ?? ''));
    setPanel('media');
  };

  const submitMedia = (event: FormEvent) => {
    event.preventDefault();
    const playback = {
      src: mediaURL,
      title: mediaTitle,
      caption: mediaCaption,
      controls: mediaControls,
      autoplay: mediaAutoplay,
      loop: mediaLoop,
      muted: mediaMuted,
      preload: mediaPreload,
    };
    const accepted = activeMedia
      ? activeMedia.kind === 'embed'
        ? setEmbed(editor, mediaURL, {
          title: mediaTitle,
          caption: mediaCaption,
          width: mediaWidth,
          height: mediaHeight,
          align: mediaAlign,
        })
        : setMediaAttributes(editor, activeMedia.kind === 'file_attachment' ? {
          src: mediaURL,
          name: mediaFileName,
          mimeType: mediaMimeType,
          description: mediaCaption,
          downloadName: mediaDownloadName,
        } : activeMedia.kind === 'video' ? {
          ...playback,
          poster: mediaPoster,
          width: mediaWidth,
          height: mediaHeight,
          align: mediaAlign,
          playsInline: mediaPlaysInline,
        } : playback)
      : mediaKind === 'embed'
        ? insertEmbed(editor, mediaURL, {
          title: mediaTitle,
          caption: mediaCaption,
          width: mediaWidth,
          height: mediaHeight,
          align: mediaAlign,
        })
        : mediaKind === 'file'
          ? insertFileAttachment(editor, {
            src: mediaURL,
            name: mediaFileName,
            mimeType: mediaMimeType,
            description: mediaCaption,
            downloadName: mediaDownloadName,
          })
          : mediaKind === 'video'
            ? insertVideo(editor, {
              ...playback,
              poster: mediaPoster,
              width: mediaWidth,
              height: mediaHeight,
              align: mediaAlign,
              playsInline: mediaPlaysInline,
            })
            : insertAudio(editor, playback);
    if (accepted) setPanel(null);
  };

  const chooseAsset = (file?: File) => {
    if (!file || !assetUpload) return;
    try {
      assetTaskRef.current?.cancel();
      const task = startAssetUpload(editor, file, {
        upload: assetUpload,
        replacePath: activeMedia && activeMedia.kind !== 'embed' ? activeMedia.path : undefined,
        attributes: activeMedia?.kind === 'file_attachment' ? {
          name: mediaFileName || file.name,
          mimeType: mediaMimeType || file.type,
          description: mediaCaption,
          downloadName: mediaDownloadName || file.name,
        } : activeMedia?.kind === 'video' ? {
          title: mediaTitle || undefined,
          caption: mediaCaption,
          poster: mediaPoster,
          width: mediaWidth,
          height: mediaHeight,
          align: mediaAlign,
          controls: mediaControls,
          autoplay: mediaAutoplay,
          loop: mediaLoop,
          muted: mediaMuted,
          preload: mediaPreload,
          playsInline: mediaPlaysInline,
        } : activeMedia?.kind === 'audio' ? {
          title: mediaTitle || undefined,
          caption: mediaCaption,
          controls: mediaControls,
          autoplay: mediaAutoplay,
          loop: mediaLoop,
          muted: mediaMuted,
          preload: mediaPreload,
        } : undefined,
      });
      assetTaskRef.current = task;
      setAssetTask(task);
      setMediaKind(task.kind);
      setPanel('media');
      void task.completion.catch((error) => onError?.(error));
    } catch (error) { onError?.(error); }
    if (assetInput.current) assetInput.current.value = '';
  };

  const hidden = new Set(hiddenActions);
  const customize = (actionId: FountainToolbarActionId, defaultLabel: string, defaultControl: ReactNode): ReactNode => {
    if (hidden.has(actionId)) return null;
    const label = actionLabels[actionId] ?? defaultLabel;
    return renderAction ? renderAction({ actionId, label, defaultControl, editor }) : defaultControl;
  };
  const tool = (
    actionId: FountainToolbarActionId,
    defaultLabel: string,
    onAction: () => void,
    options: { active?: boolean; disabled?: boolean } = {},
  ): ReactNode => {
    const label = actionLabels[actionId] ?? defaultLabel;
    const icon = Object.prototype.hasOwnProperty.call(actionIcons, actionId)
      ? actionIcons[actionId]
      : <FountainToolbarIcon name={actionId} />;
    return customize(actionId, defaultLabel, <FountainToolbarButton
      actionId={actionId}
      label={label}
      icon={icon}
      active={options.active}
      disabled={options.disabled}
      onAction={onAction}
    />);
  };
  const menuTool = (
    actionId: FountainToolbarActionId,
    defaultLabel: string,
    onAction: () => void,
    options: { disabled?: boolean; danger?: boolean } = {},
  ): ReactNode => {
    const label = actionLabels[actionId] ?? defaultLabel;
    return customize(actionId, defaultLabel, <FountainToolbarButton
      actionId={actionId}
      label={label}
      icon={<span>{label}</span>}
      className={options.danger ? 'is-danger' : undefined}
      disabled={options.disabled}
      onAction={onAction}
    />);
  };
  const colorLabel = actionLabels['text-color'] ?? 'Text color';
  const colorControl = customize('text-color', 'Text color', <label
    className="fountain-toolbar__color"
    title={colorLabel}
    data-fountain-toolbar-action="text-color"
  >
    {Object.prototype.hasOwnProperty.call(actionIcons, 'text-color')
      ? actionIcons['text-color']
      : <FountainToolbarIcon name="text-color" />}
    <input aria-label={colorLabel} type="color" defaultValue="#171923" onChange={(event) => setMark(editor, 'text_color', { color: event.target.value })} />
  </label>);
  const defaultGroupLabels: Readonly<Record<FountainToolbarGroupId, string>> = {
    history: 'History and search',
    'block-types': 'Block types',
    marks: 'Text formatting',
    alignment: 'Alignment',
    insert: 'Insert rich content',
    table: 'Edit table',
  };
  type ToolbarEntry = readonly [FountainToolbarActionId, ReactNode];
  const entry = (actionId: FountainToolbarActionId, control: ReactNode): ToolbarEntry => [actionId, control];
  const toolbarGroup = (groupId: FountainToolbarGroupId, entries: readonly ToolbarEntry[]) => {
    const requested = actionOrder[groupId] ?? [];
    const byId = new Map(entries);
    const orderedIds = [...new Set([...requested, ...entries.map(([actionId]) => actionId)])];
    return <FountainToolbarGroup
      key={groupId}
      label={groupLabels[groupId] ?? defaultGroupLabels[groupId]}
      data-fountain-toolbar-group={groupId}
    >
      {orderedIds.map((actionId) => byId.has(actionId)
        ? <Fragment key={actionId}>{byId.get(actionId)}</Fragment>
        : null)}
    </FountainToolbarGroup>;
  };
  const groupRenderers: Readonly<Record<FountainToolbarGroupId, () => ReactNode>> = {
    history: () => toolbarGroup('history', [
      entry('undo', tool('undo', 'Undo', () => undo(editor), { disabled: !canUndo(editor) })),
      entry('redo', tool('redo', 'Redo', () => redo(editor), { disabled: !canRedo(editor) })),
      entry('search', tool('search', 'Find and replace', () => setPanel(panel === 'search' ? null : 'search'))),
      entry('clipboard-history', clipboardHistory && tool('clipboard-history', 'Clipboard history (Ctrl/Command+Alt+V)', () => openClipboardHistory(editor), { active: clipboardHistory.open })),
    ]),
    'block-types': () => toolbarGroup('block-types', [
      entry('paragraph', tool('paragraph', 'Paragraph', () => setBlockType(editor, 'paragraph'))),
      entry('heading-1', tool('heading-1', 'Heading 1', () => setBlockType(editor, 'heading', { level: 1 }))),
      entry('heading-2', tool('heading-2', 'Heading 2', () => setBlockType(editor, 'heading', { level: 2 }))),
      entry('heading-3', tool('heading-3', 'Heading 3', () => setBlockType(editor, 'heading', { level: 3 }))),
    ]),
    marks: () => toolbarGroup('marks', [
      entry('bold', tool('bold', 'Bold', mark('strong'), { active: isMarkActive(editor, 'strong') })),
      entry('italic', tool('italic', 'Italic', mark('em'), { active: isMarkActive(editor, 'em') })),
      entry('underline', tool('underline', 'Underline', mark('underline'), { active: isMarkActive(editor, 'underline') })),
      entry('strike', tool('strike', 'Strikethrough', mark('strike'), { active: isMarkActive(editor, 'strike') })),
      entry('inline-code', tool('inline-code', 'Inline code', mark('code'), { active: isMarkActive(editor, 'code') })),
      entry('highlight', tool('highlight', 'Highlight text and choose colour', () => setPanel(panel === 'highlight' ? null : 'highlight'), {
        active: panel === 'highlight' || isMarkActive(editor, 'highlight'),
      })),
      entry('subscript', tool('subscript', 'Subscript', mark('subscript'), { active: isMarkActive(editor, 'subscript') })),
      entry('superscript', tool('superscript', 'Superscript', mark('superscript'), { active: isMarkActive(editor, 'superscript') })),
      entry('link', tool('link', 'Add or edit link', toggleLinkPanel, { active: Boolean(activeLink) || isMarkActive(editor, 'link') })),
      entry('unlink', tool('unlink', 'Remove link', () => removeLink(editor), { disabled: !activeLink && !isMarkActive(editor, 'link') })),
      entry('text-color', colorControl),
      entry('clear-text-color', tool('clear-text-color', 'Remove text color', () => unsetMark(editor, 'text_color'), { disabled: !isMarkActive(editor, 'text_color') })),
      entry('text-style', tool('text-style', 'Text styles', toggleTextStylePanel, {
        active: panel === 'text-style' || Boolean(activeTextStyle.color || activeTextStyle.backgroundColor || activeTextStyle.fontFamily || activeTextStyle.fontSize || activeTextStyle.lineHeight),
      })),
    ]),
    alignment: () => toolbarGroup('alignment', [
      entry('align-left', tool('align-left', 'Align left', () => activeImage ? setImageAlignment(editor, 'left') : setTextAlignment(editor, 'left'), { active: activeImage?.node.attrs.align === 'left' })),
      entry('align-center', tool('align-center', 'Align center', () => activeImage ? setImageAlignment(editor, 'center') : setTextAlignment(editor, 'center'), { active: activeImage?.node.attrs.align === 'center' })),
      entry('align-right', tool('align-right', 'Align right', () => activeImage ? setImageAlignment(editor, 'right') : setTextAlignment(editor, 'right'), { active: activeImage?.node.attrs.align === 'right' })),
      entry('justify', tool('justify', 'Justify', () => setTextAlignment(editor, 'justify'))),
    ]),
    insert: () => toolbarGroup('insert', [
      entry('quote', tool('quote', isInsideNode(editor, 'blockquote') ? 'Remove quote' : 'Quote selected blocks', () => toggleQuote(editor), { active: isInsideNode(editor, 'blockquote') })),
      entry('bullet-list', tool('bullet-list', 'Bullet list', () => toggleList(editor, 'bullet'), { active: isInsideNode(editor, 'bullet_list') })),
      entry('ordered-list', tool('ordered-list', 'Numbered list', () => toggleList(editor, 'ordered'), { active: isInsideNode(editor, 'ordered_list') })),
      entry('task-list', tool('task-list', 'Task list', () => toggleList(editor, 'task'), { active: isInsideNode(editor, 'task_list') })),
      entry('outdent-list', tool('outdent-list', 'Lift list item', () => outdentListItem(editor), { disabled: !isInsideNode(editor, 'list_item') && !isInsideNode(editor, 'task_item') })),
      entry('indent-list', tool('indent-list', 'Indent list item', () => indentListItem(editor), { disabled: !isInsideNode(editor, 'list_item') && !isInsideNode(editor, 'task_item') })),
      entry('code-block', tool('code-block', 'Code block and language', toggleCodePanel, { active: Boolean(activeCodeBlock) })),
      entry('insert-table', tool('insert-table', 'Insert table', () => setPanel(panel === 'insert-table' ? null : 'insert-table'), { active: panel === 'insert-table' })),
      entry('image', tool('image', activeImage ? 'Edit selected image' : 'Insert image from URL', toggleImagePanel, { active: Boolean(activeImage) })),
      entry('upload-image', tool('upload-image', activeImage ? 'Replace selected image' : 'Upload image', () => fileInput.current?.click())),
      entry('media', editor.state.schema.nodes.audio && tool('media', activeMedia ? 'Edit selected media' : 'Insert audio, video, file, or embed', () => toggleMediaPanel(), { active: Boolean(activeMedia) })),
      entry('upload-asset', editor.state.schema.nodes.audio && tool('upload-asset', assetUpload ? (activeMedia && activeMedia.kind !== 'embed' ? 'Replace selected media file' : 'Upload audio, video, or file') : 'Configure assetUpload to upload files', () => assetInput.current?.click(), { disabled: !assetUpload || activeMedia?.kind === 'embed' })),
      entry('divider', tool('divider', 'Divider', () => insertBlock(editor, 'horizontal_rule'))),
      entry('hard-break', tool('hard-break', 'Line break', () => insertHardBreak(editor))),
    ]),
    table: () => tableControls === 'expanded' ? toolbarGroup('table', [
      entry('add-table-row', tool('add-table-row', 'Add table row', () => addTableRow(editor), { disabled: !isInsideNode(editor, 'table') })),
      entry('delete-table-row', tool('delete-table-row', 'Delete table row', () => deleteTableRow(editor), { disabled: !isInsideNode(editor, 'table') })),
      entry('add-table-column', tool('add-table-column', 'Add table column', () => addTableColumn(editor), { disabled: !isInsideNode(editor, 'table') })),
      entry('delete-table-column', tool('delete-table-column', 'Delete table column', () => deleteTableColumn(editor), { disabled: !isInsideNode(editor, 'table') })),
      entry('delete-table', tool('delete-table', 'Delete entire table', () => deleteTable(editor), { disabled: !tableSelected })),
      entry('merge-cells', tool('merge-cells', 'Merge selected table cells', () => mergeTableCells(editor), { disabled: !(editor.state.selection instanceof CellSelection) || editor.state.selection.cellPaths.length < 2 })),
      entry('split-cell', tool('split-cell', 'Split merged table cell', () => splitTableCell(editor), { disabled: !activeTable || (activeTable.cell.colspan === 1 && activeTable.cell.rowspan === 1) })),
      entry('toggle-header-row', tool('toggle-header-row', 'Toggle header row', () => toggleTableHeaderRow(editor), { disabled: !activeTable })),
      entry('toggle-header-column', tool('toggle-header-column', 'Toggle header column', () => toggleTableHeaderColumn(editor), { disabled: !activeTable })),
      entry('toggle-header-cell', tool('toggle-header-cell', 'Toggle header cell', () => toggleTableHeaderCell(editor), { disabled: !activeTable })),
      entry('select-row', tool('select-row', 'Select table row', () => selectTableRow(editor), { disabled: !activeTable })),
      entry('select-column', tool('select-column', 'Select table column', () => selectTableColumn(editor), { disabled: !activeTable })),
      entry('column-width', tool('column-width', 'Set table column width', () => {
        const width = activeTable?.map.columnWidth(activeTable.cell.column) ?? 120;
        setTableWidth(String(width));
        setPanel(panel === 'table' ? null : 'table');
      }, { disabled: !activeTable })),
    ]) : tableSelected ? toolbarGroup('table', [
      entry('table-menu', tool('table-menu', 'Table options', () => {
        const width = activeTable?.map.columnWidth(activeTable.cell.column) ?? 120;
        setTableWidth(String(width));
        setPanel(panel === 'table' ? null : 'table');
      }, { active: panel === 'table' })),
    ]) : null,
  };
  const visibleGroups = [...new Set(groups)].filter((group): group is FountainToolbarGroupId => group in groupRenderers);

  return (
    <div className="fountain-toolbar-wrap">
      <FountainToolbarRoot className={className} label={toolbarLabel}>
        {visibleGroups.map((group) => groupRenderers[group]())}
        {extraActions}
        <input ref={fileInput} className="fountain-toolbar__file" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={(event) => void chooseImage(event.target.files?.[0])} />
        <input ref={assetInput} className="fountain-toolbar__file" type="file" accept="audio/*,video/*,application/pdf,text/*,.zip" tabIndex={-1} aria-hidden="true" onChange={(event) => chooseAsset(event.target.files?.[0])} />
      </FountainToolbarRoot>
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
      {panel === 'text-style' && <form className="fountain-toolbar__popover is-text-style" onSubmit={(event) => event.preventDefault()}>
        <strong>Text styles</strong>
        <p className="fountain-toolbar__hint">Apply one property at a time. Blank values mean unset or mixed text.</p>
        <fieldset className="fountain-toolbar__style-field">
          <label>Font family
            <input
              aria-label="Font family"
              list={fontFamilyListId}
              maxLength={320}
              placeholder={activeTextStyle.mixed.includes('fontFamily') ? 'Mixed fonts' : 'For example Inter, sans-serif'}
              value={fontFamilyValue}
              onChange={(event) => setFontFamilyValue(event.target.value)}
            />
          </label>
          <div className="fountain-toolbar__style-actions">
            <button type="button" disabled={!fontFamilyValue.trim()} onClick={() => applyTextStyle('Font family', () => setFontFamily(editor, fontFamilyValue))}>Apply font</button>
            <button type="button" onClick={() => { unsetFontFamily(editor); setFontFamilyValue(''); setTextStyleError(''); }}>Remove font</button>
          </div>
        </fieldset>
        <datalist id={fontFamilyListId}>
          {['system-ui', 'Inter, sans-serif', 'Arial, sans-serif', 'Georgia, serif', 'Courier New, monospace', 'Noto Sans JP, sans-serif'].map((family) => <option key={family} value={family} />)}
        </datalist>
        <fieldset className="fountain-toolbar__style-field">
          <label>Font size
            <input aria-label="Font size" placeholder={activeTextStyle.mixed.includes('fontSize') ? 'Mixed sizes' : '16px, 12pt, 1rem, or 100%'} value={fontSizeValue} onChange={(event) => setFontSizeValue(event.target.value)} />
          </label>
          <div className="fountain-toolbar__style-actions">
            <button type="button" disabled={!fontSizeValue.trim()} onClick={() => applyTextStyle('Font size', () => setFontSize(editor, fontSizeValue))}>Apply size</button>
            <button type="button" onClick={() => { unsetFontSize(editor); setFontSizeValue(''); setTextStyleError(''); }}>Remove size</button>
          </div>
        </fieldset>
        <fieldset className="fountain-toolbar__style-field">
          <label>Line height
            <input aria-label="Line height" placeholder={activeTextStyle.mixed.includes('lineHeight') ? 'Mixed line heights' : '1.5, 24px, or 150%'} value={lineHeightValue} onChange={(event) => setLineHeightValue(event.target.value)} />
          </label>
          <div className="fountain-toolbar__style-actions">
            <button type="button" disabled={!lineHeightValue.trim()} onClick={() => applyTextStyle('Line height', () => setLineHeight(editor, lineHeightValue))}>Apply line height</button>
            <button type="button" onClick={() => { unsetLineHeight(editor); setLineHeightValue(''); setTextStyleError(''); }}>Remove line height</button>
          </div>
        </fieldset>
        <fieldset className="fountain-toolbar__style-field">
          <label>Text colour <input aria-label="Text colour" type="color" value={styleColor} onChange={(event) => setStyleColor(event.target.value)} /></label>
          <div className="fountain-toolbar__style-actions">
            <button type="button" onClick={() => applyTextStyle('Text colour', () => setTextColor(editor, styleColor))}>Apply colour</button>
            <button type="button" onClick={() => { unsetMark(editor, 'text_color'); setTextStyleError(''); }}>Remove colour</button>
          </div>
        </fieldset>
        <fieldset className="fountain-toolbar__style-field">
          <label>Background colour <input aria-label="Background colour" type="color" value={styleBackground} onChange={(event) => setStyleBackground(event.target.value)} /></label>
          <div className="fountain-toolbar__style-actions">
            <button type="button" onClick={() => applyTextStyle('Background colour', () => setBackgroundColor(editor, styleBackground))}>Apply background</button>
            <button type="button" onClick={() => { unsetBackgroundColor(editor); setTextStyleError(''); }}>Remove background</button>
          </div>
        </fieldset>
        {textStyleError && <p className="fountain-toolbar__error" role="alert">{textStyleError}</p>}
        <button type="button" onClick={() => setPanel(null)}>Close</button>
      </form>}
      {panel === 'highlight' && <form className="fountain-toolbar__popover is-highlight" onSubmit={(event) => {
        event.preventDefault();
        if (setMark(editor, 'highlight', { color: highlightColor })) setPanel(null);
      }}>
        <strong>Highlight text</strong>
        <label>Colour <input aria-label="Highlight colour" type="color" value={highlightColor} onChange={(event) => setHighlightColor(event.target.value)} /></label>
        <button type="submit">Apply highlight</button>
        <button type="button" disabled={!isMarkActive(editor, 'highlight')} onClick={() => { unsetMark(editor, 'highlight'); setPanel(null); }}>Remove highlight</button>
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
      {panel === 'media' && <form className="fountain-toolbar__popover is-media" onSubmit={submitMedia}>
        <strong>{activeMedia ? 'Edit media' : 'Add media'}</strong>
        <select aria-label="Media type" value={mediaKind} disabled={Boolean(activeMedia)} onChange={(event) => {
          const kind = event.target.value as AssetUploadKind | 'embed';
          setMediaKind(kind);
          setMediaHeight(kind === 'embed' ? '360px' : 'auto');
        }}>
          <option value="audio">Audio</option>
          <option value="video">Video</option>
          <option value="file">Downloadable file</option>
          <option value="embed">Approved embed</option>
        </select>
        <input aria-label="Media URL" required inputMode="url" placeholder={mediaKind === 'embed' ? 'YouTube or Vimeo URL' : 'https://cdn.example.com/file'} value={mediaURL} onChange={(event) => setMediaURL(event.target.value)} />
        {mediaKind === 'file' ? <>
          <input aria-label="File name" required placeholder="Visible file name" value={mediaFileName} onChange={(event) => setMediaFileName(event.target.value)} />
          <input aria-label="File MIME type" placeholder="application/pdf" value={mediaMimeType} onChange={(event) => setMediaMimeType(event.target.value)} />
          <input aria-label="Download file name" placeholder="Optional downloaded filename" value={mediaDownloadName} onChange={(event) => setMediaDownloadName(event.target.value)} />
          <textarea aria-label="File description" placeholder="Description (optional)" value={mediaCaption} onChange={(event) => setMediaCaption(event.target.value)} />
        </> : <>
          <input aria-label="Media title" required={mediaKind === 'embed'} placeholder={mediaKind === 'embed' ? 'Accessible embed title' : 'Title (optional)'} value={mediaTitle} onChange={(event) => setMediaTitle(event.target.value)} />
          <textarea aria-label="Media caption" placeholder="Caption (optional)" value={mediaCaption} onChange={(event) => setMediaCaption(event.target.value)} />
        </>}
        {mediaKind === 'video' && <input aria-label="Video poster URL" inputMode="url" placeholder="Poster image URL (optional)" value={mediaPoster} onChange={(event) => setMediaPoster(event.target.value)} />}
        {(mediaKind === 'video' || mediaKind === 'embed') && <>
          <label>Width <input aria-label="Media width" required placeholder="100% or 640px" value={mediaWidth} onChange={(event) => setMediaWidth(event.target.value)} /></label>
          <label>Height <input aria-label="Media height" required placeholder="auto or 360px" value={mediaHeight} onChange={(event) => setMediaHeight(event.target.value)} /></label>
          <select aria-label="Media alignment" value={mediaAlign} onChange={(event) => setMediaAlign(event.target.value as MediaAlignment)}>
            <option value="left">Align left</option>
            <option value="center">Align center</option>
            <option value="right">Align right</option>
          </select>
        </>}
        {(mediaKind === 'audio' || mediaKind === 'video') && <details>
          <summary>Playback and accessibility</summary>
          <select aria-label="Media preload" value={mediaPreload} onChange={(event) => setMediaPreload(event.target.value as MediaPreload)}>
            <option value="none">Do not preload</option>
            <option value="metadata">Preload metadata</option>
            <option value="auto">Allow preload</option>
          </select>
          <label className="fountain-toolbar__check"><input type="checkbox" checked={mediaControls} onChange={(event) => setMediaControls(event.target.checked)} /> Show controls</label>
          <label className="fountain-toolbar__check"><input type="checkbox" checked={mediaAutoplay} onChange={(event) => setMediaAutoplay(event.target.checked)} /> Autoplay</label>
          <label className="fountain-toolbar__check"><input type="checkbox" checked={mediaLoop} onChange={(event) => setMediaLoop(event.target.checked)} /> Loop</label>
          <label className="fountain-toolbar__check"><input type="checkbox" checked={mediaMuted} onChange={(event) => setMediaMuted(event.target.checked)} /> Muted</label>
          {mediaKind === 'video' && <label className="fountain-toolbar__check"><input type="checkbox" checked={mediaPlaysInline} onChange={(event) => setMediaPlaysInline(event.target.checked)} /> Play inline on mobile</label>}
          <p>Caption tracks are available through the typed <code>tracks</code> attribute.</p>
        </details>}
        {mediaKind === 'embed' && <p className="fountain-toolbar__hint">The default policy accepts YouTube and Vimeo and renders privacy-enhanced, sandboxed iframes. Hosts can replace the provider allowlist.</p>}
        <div className="fountain-toolbar__image-actions">
          <button type="submit">{activeMedia ? 'Save media' : 'Insert URL'}</button>
          {assetUpload && mediaKind !== 'embed' && <button type="button" onClick={() => assetInput.current?.click()}>{activeMedia ? 'Replace file' : 'Choose file'}</button>}
          {activeMedia && <button type="button" onClick={() => { deleteMedia(editor); setPanel(null); }}>Delete media</button>}
          <button type="button" onClick={() => setPanel(null)}>Close</button>
        </div>
        {assetSnapshot && <div className="fountain-image-upload" role="status" aria-live="polite">
          <span>{assetSnapshot.status === 'uploading'
            ? `Uploading ${assetSnapshot.fileName}: ${Math.round(assetSnapshot.progress * 100)}%`
            : assetSnapshot.status === 'succeeded'
              ? `${assetSnapshot.fileName} inserted`
              : assetSnapshot.status === 'cancelled'
                ? `${assetSnapshot.fileName} cancelled`
                : `Upload failed: ${assetSnapshot.error instanceof Error ? assetSnapshot.error.message : 'Unknown error'}`}</span>
          {assetSnapshot.status === 'uploading' && <>
            <progress max="1" value={assetSnapshot.progress} />
            <button type="button" onClick={() => assetTask?.cancel()}>Cancel upload</button>
          </>}
          {assetSnapshot.status === 'failed' && <button type="button" onClick={() => void assetTask?.retry().catch((error) => onError?.(error))}>Retry upload</button>}
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
      {panel === 'table' && tableSelected && <form className="fountain-toolbar__popover is-table-tools" onSubmit={(event) => event.preventDefault()}>
        <div className="fountain-toolbar__table-heading">
          <strong>Table options</strong>
          <p className="fountain-toolbar__hint">Changes apply to the cell containing the cursor. Select adjacent cells with Shift-click before merging.</p>
        </div>
        <fieldset><legend>Selection</legend>
          {menuTool('select-row', 'Select row', () => selectTableRow(editor), { disabled: !activeTable })}
          {menuTool('select-column', 'Select column', () => selectTableColumn(editor), { disabled: !activeTable })}
          {menuTool('merge-cells', 'Merge selected cells', () => mergeTableCells(editor), { disabled: !(editor.state.selection instanceof CellSelection) || editor.state.selection.cellPaths.length < 2 })}
          {menuTool('split-cell', 'Split merged cell', () => splitTableCell(editor), { disabled: !activeTable || (activeTable.cell.colspan === 1 && activeTable.cell.rowspan === 1) })}
        </fieldset>
        <fieldset><legend>Rows</legend>
          {menuTool('add-table-row-above', 'Add row above', () => addTableRow(editor, 'before'), { disabled: !activeTable })}
          {menuTool('add-table-row-below', 'Add row below', () => addTableRow(editor, 'after'), { disabled: !activeTable })}
          {menuTool('delete-table-row', 'Delete current row', () => deleteTableRow(editor), { disabled: !activeTable })}
          {menuTool('toggle-header-row', 'Make/unmake header row', () => toggleTableHeaderRow(editor), { disabled: !activeTable })}
        </fieldset>
        <fieldset><legend>Columns</legend>
          {menuTool('add-table-column-left', 'Add column left', () => addTableColumn(editor, 'before'), { disabled: !activeTable })}
          {menuTool('add-table-column-right', 'Add column right', () => addTableColumn(editor, 'after'), { disabled: !activeTable })}
          {menuTool('delete-table-column', 'Delete current column', () => deleteTableColumn(editor), { disabled: !activeTable })}
          {menuTool('toggle-header-column', 'Make/unmake header column', () => toggleTableHeaderColumn(editor), { disabled: !activeTable })}
        </fieldset>
        <fieldset><legend>Cell</legend>
          {menuTool('toggle-header-cell', 'Make/unmake this cell a header', () => toggleTableHeaderCell(editor), { disabled: !activeTable })}
          <label>Column width <input aria-label="Table column width" required type="number" min="40" max="2000" step="1" value={tableWidth} onChange={(event) => setTableWidth(event.target.value)} /></label>
          {menuTool('column-width', 'Apply width', () => resizeTableColumn(editor, Number(tableWidth)), { disabled: !activeTable })}
        </fieldset>
        <div className="fountain-toolbar__table-footer">
          {menuTool('delete-table', 'Delete entire table', () => { deleteTable(editor); setPanel(null); }, { danger: true })}
          <button type="button" onClick={() => setPanel(null)}>Close</button>
        </div>
      </form>}
      {panel === 'insert-table' && <form className="fountain-toolbar__popover is-table" onSubmit={(event) => {
        event.preventDefault();
        if (insertTable(editor, { rows: Number(tableRows), columns: Number(tableColumns), headerRow: true })) setPanel(null);
      }}>
        <strong>Insert table</strong>
        <label>Rows <input aria-label="Table rows" required type="number" min="1" max="50" step="1" value={tableRows} onChange={(event) => setTableRows(event.target.value)} /></label>
        <label>Columns <input aria-label="Table columns" required type="number" min="1" max="20" step="1" value={tableColumns} onChange={(event) => setTableColumns(event.target.value)} /></label>
        <button type="submit">Insert</button>
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
