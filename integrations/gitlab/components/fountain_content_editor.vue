<script>
import { GlAlert, GlButton, GlLoadingIcon } from '@gitlab/ui';
import { markRaw } from 'vue';
import katex from 'katex';
// Direct editor entry must not depend on the reader having loaded math styles.
import 'katex/dist/katex.min.css';
import axios from '~/lib/utils/axios_utils';
import { s__, n__, sprintf } from '~/locale';
import CommentTemplatesModal from '~/vue_shared/components/markdown/comment_templates_modal.vue';
import EditorModeSwitcher from '~/vue_shared/components/markdown/editor_mode_switcher.vue';
import { CONTENT_EDITOR_READY_EVENT, CONTENT_EDITOR_PASTE } from '~/vue_shared/constants';
import markdownEditorEventHub from '~/vue_shared/components/markdown/eventhub';
import { TIPTAP_AUTOFOCUS_OPTIONS } from '../constants';
import {
  GitLabContentEditor,
  createKaTeXRenderer,
  selectAll,
  assertGitLabNativeHostConfiguration,
  parseGitLabQuickActionCommands,
} from '../runtime/browser';
import { createGitLabAutocompleteProvider } from '../services/fountain_autocomplete';
import FountainEditorSurface from './fountain_editor_surface.vue';
import FountainFormattingToolbar from './fountain_formatting_toolbar.vue';
import FountainLinkMenu from './fountain_link_menu.vue';
import CodeBlockBubbleMenu from './bubble_menus/code_block_bubble_menu.vue';
import FountainAlertMenu from './fountain_alert_menu.vue';
import MediaBubbleMenu from './bubble_menus/media_bubble_menu.vue';
import FountainReferenceMenu from './fountain_reference_menu.vue';
import FountainQuickActionMenu from './fountain_quick_action_menu.vue';

async function loadWikiCollaboration(provider) {
  const [types, {updateYFragment}, {getSchema}, extensions, {assignUserColor}] = await Promise.all([
    import('yjs'), import('y-prosemirror'), import('@tiptap/core'), import('../extensions'),
    import('~/collaborative_editing/user_colors'),
  ]);
  const stockSchema = getSchema(['Document','Paragraph','Heading','Blockquote','BulletList','OrderedList','ListItem',
    'HardBreak','HorizontalRule','CodeBlockHighlight','Table','TableRow','TableHeader','TableCell','Text','Bold','Italic','Strike','Code','Subscript','Superscript','Link'].map(name => extensions[name]));
  return {provider,wire:{types,stockSchema,updateYFragment},colorFor:assignUserColor};
}

export default {
  inject: {
    fountainWikiSource: { default: false },
    setFountainWikiUploadPending: { default: null },
    inheritedCommentTemplatePaths: { from: 'newCommentTemplatePaths', default: () => [] },
  },
  name: 'FountainContentEditor',
  components: {
    GlAlert,
    GlButton,
    GlLoadingIcon,
    CommentTemplatesModal,
    EditorModeSwitcher,
    FountainEditorSurface,
    FountainFormattingToolbar,
    FountainLinkMenu,
    CodeBlockBubbleMenu,
    FountainAlertMenu,
    MediaBubbleMenu,
    FountainReferenceMenu,
    FountainQuickActionMenu,
  },
  // The installer inserts the pinned host's exact public prop definitions here.
  props: {},
  emits: ['blur', 'change', 'enable-markdown-editor', 'focus', 'initialized', 'keydown', 'loading'],
  data() {
    return {
      focused: false,
      inactive: false,
      isLoading: false,
      latestMarkdown: null,
      failure: null,
      fatal: false,
      hasRecovery: false,
      replacementSource: null,
      inserting: false,
      waitingForWikiFile: false,
      peerUploadNames: [],
      failedInsertionSource: null,
      loadFailed: false,
      uploads: [],
    };
  },
  computed: {
    surfaceEditable() {
      return this.editable && !this.inactive && !this.isLoading && !this.loadFailed && !this.fatal;
    },
    commentTemplatePaths() {
      return this.inheritedCommentTemplatePaths.length ? this.inheritedCommentTemplatePaths : this.newCommentTemplatePaths;
    },
    wikiUploadPending() {
      return this.waitingForWikiFile || this.uploads.length > 0 || this.peerUploadNames.length > 0;
    },
    canUpload() {
      return this.surfaceEditable && !this.disableAttachments && Boolean(this.uploadsPath);
    },
    failureMessage() {
      if (this.failureCode === 'GITLAB_WIKI_DISCONNECTED')
        return s__('ContentEditor|Your wiki draft is still here. Reconnect to the shared session before saving.');
      if (this.failureCode === 'GITLAB_CODE_SOURCE_DRAFT_PENDING')
        return s__('ContentEditor|Apply or cancel your source draft before saving or switching editing mode.');
      if (this.failureCode === 'GITLAB_ALERT_TITLE_SINGLE_LINE')
        return s__('ContentEditor|Alert titles must stay on one line. Paste multiple paragraphs into the alert body instead.');
      if (this.failureCode === 'GITLAB_UPLOAD_QUEUE_FULL')
        return s__('ContentEditor|Too many files were selected. None of this selection was uploaded. Wait for uploads to finish or remove failed files, then select fewer files.');
      if (this.failureCode === 'GITLAB_LINK_TEXT_SELECTION_REQUIRED')
        return s__('ContentEditor|Select text within one paragraph, or place the cursor where the link should go.');
      if (this.failureCode === 'GITLAB_UPLOAD_DISABLED')
        return s__('ContentEditor|File uploads are unavailable in this editor.');
      if (this.failureCode === 'GITLAB_CLIPBOARD_READ_FAILED')
        return s__(
          'ContentEditor|Unable to read the clipboard. Check browser clipboard permissions, or use your browser paste command.',
        );
      if (this.failureCode === 'GITLAB_INSERTION_TARGET_CHANGED')
        return s__(
          'ContentEditor|Paste stopped because the selected content changed. Your document is unchanged by the paste, and its source is retained below.',
        );
      return s__(
        'ContentEditor|The editor operation could not be completed. Your source and current document are retained.',
      );
    },
    failureCode() {
      const message = this.failure?.message;
      if (typeof message === 'string' && /^[A-Z][A-Z0-9_]+$/u.test(message)) return message;
      return this.failure ? 'GITLAB_NATIVE_OPERATION_FAILED' : null;
    },
    surfaceOptions() {
      return {
        ariaLabel: this.ariaLabel || s__('ContentEditor|Rich text editor'),
        className: 'rte-text-box',
        placeholder: this.placeholder,
        attributes: {
          ...(this.ariaLabelledBy ? { 'aria-labelledby': this.ariaLabelledBy } : {}),
          ...(this.ariaDescribedBy ? { 'aria-describedby': this.ariaDescribedBy } : {}),
        },
        onError: this.onSurfaceError,
        handleFiles: this.attachFiles,
      };
    },
    editingLimitsMessage() {
      return s__('ContentEditor|Use plain text editing for unsupported references, quick actions, and specialized menus.');
    },
    adapterGaps() {
      return (
        this.enableAutocomplete ||
        Object.keys(this.autocompleteDataSources).length > 0 ||
        this.supportsQuickActions ||
        this.drawioEnabled
      );
    },
  },
  watch: {
    wikiUploadPending(value) { if (this.collaborationProvider) this.setFountainWikiUploadPending?.(value); },
    markdown(value) {
      if (value === this.latestMarkdown || !this.contentEditor) return;
      // A fresh handoff may echo an edit suppressed from change events. Reuse
      // only an exact serialization of this owner's already-ready model.
      if (this.contentEditor.status === 'ready') {
        try {
          if (this.contentEditor.getSerializedContent() === value) {
            this.latestMarkdown = value;
            return;
          }
        } catch { /* An unreadable model still needs normal source conversion. */ }
      }
      this.setSerializedContent(value, { addToHistory: true });
    },
  },
  created() {
    this.contentEditor = null;
    this.releaseChange = null;
    this.releaseStatus = null;
    this.loadRequest = 0;
    this.loadOptions = undefined;
    this.disposed = false;
    this.pasteConnected = false;
    this.quickActionCache = null;
    try {
      this.validateHostConfiguration();
      this.contentEditor = markRaw(
        new GitLabContentEditor({
          preserveWikiSource: this.fountainWikiSource,
          wikiCollaboration: this.collaborationProvider ? () => loadWikiCollaboration(this.collaborationProvider) : undefined,
          tableOfContentsLabel: this.supportsTableOfContents ? s__('ContentEditor|Table of contents') : undefined,
          renderMarkdown: (markdown, options) =>
            this.renderMarkdown(markdown, { ...options, noHeaderAnchors: true }),
          describeLabels: this.describeLabels,
          describeMedia: kind => kind === 'audio' ? s__('ContentEditor|Select audio') : s__('ContentEditor|Select video'),
          editable: this.editable,
          extensions: this.extensions,
          serializerConfig: this.serializerConfig,
          renderMath: createKaTeXRenderer(katex),
          onListenerError: this.onSurfaceError,
          uploadAttachment: this.uploadFile,
          getSuggestionContext: () => this.codeSuggestionsConfig,
          loadSuggestionSource: this.fetchSuggestionSource,
          quickActionProvider: this.supportsQuickActions ? this.fetchQuickActions : undefined,
          autocompleteProvider: this.enableAutocomplete ? createGitLabAutocompleteProvider({
            getSources: () => this.autocompleteDataSources,
            getRoot: this.getEditorRoot,
            getSidebar: () => this.sidebarMediator,
          }) : undefined,
        }),
      );
      this.releaseChange = this.contentEditor.subscribeChange(this.onDocumentChange);
      this.releaseStatus = this.contentEditor.subscribeStatus(() => {
        this.hasRecovery = Boolean(this.contentEditor.recovery);
        this.replacementSource = this.contentEditor.recovery?.markdown ?? null;
        this.inserting = this.contentEditor.pendingInsertions > 0;
      });
      this.releasePeerUploads = this.contentEditor.subscribePeerWikiUploads(names => { this.peerUploadNames = names; });
      this.releaseUploads = this.contentEditor.subscribeUploads(uploads => { this.uploads = uploads; });
    } catch (error) {
      this.fatal = true;
      this.onSurfaceError(error);
    }
  },
  async mounted() {
    this.$emit('initialized');
    this.connectPasteHub();
    if (this.contentEditor) await this.setSerializedContent(this.markdown);
  },
  activated() {
    try { this.validateHostConfiguration(); }
    catch (error) {
      this.fatal = true;
      this.disconnectPasteHub();
      this.onSurfaceError(error);
      return;
    }
    this.inactive = false;
    this.connectPasteHub();
    this.$nextTick(() => {
      if (!this.disposed && !this.inactive && !this.isLoading && !this.loadFailed
        && !this.fatal && this.latestMarkdown === this.markdown && this.contentEditor?.status === 'ready')
        markdownEditorEventHub.$emit(CONTENT_EDITOR_READY_EVENT);
    });
  },
  deactivated() {
    this.inactive = true;
    this.disconnectPasteHub();
  },
  beforeDestroy() {
    this.disconnectPasteHub();
    if (this.collaborationProvider && this.wikiUploadPending) this.setFountainWikiUploadPending?.(false);
    this.disposed = true;
    this.loadRequest += 1;
    this.releaseChange?.();
    this.releaseStatus?.();
    this.releasePeerUploads?.();
    this.releaseUploads?.();
    this.contentEditor?.dispose();
  },
  methods: {
    validateHostConfiguration() {
      assertGitLabNativeHostConfiguration({
        collaborationProvider: this.collaborationProvider,
        serializerConfig: this.serializerConfig,
        codeSuggestionsConfig: this.codeSuggestionsConfig,
      }, { codeSuggestions: true, extensions: this.extensions,
        wikiProvider:this.fountainWikiSource && this.collaborationProvider?.channel === 'CollaborativeEditing::WikiPageChannel'
          ? this.collaborationProvider : undefined });
    },
    connectPasteHub() {
      if (this.pasteConnected || !this.contentEditor || this.fatal || this.inactive) return;
      markdownEditorEventHub.$on(CONTENT_EDITOR_PASTE, this.pasteContent);
      this.pasteConnected = true;
    },
    disconnectPasteHub() {
      if (!this.pasteConnected) return;
      markdownEditorEventHub.$off(CONTENT_EDITOR_PASTE, this.pasteContent);
      this.pasteConnected = false;
    },
    getEditorRoot() { return this.$refs.surface?.getRootElement(); },
    onSurfaceReady() {
      this.$refs.linkMenu?.refreshRoot?.();
      this.$refs.codeMenu?.refreshRoot?.();
      this.$refs.mediaMenu?.refreshRoot?.();
      this.$refs.quickActionMenu?.refreshRoot?.();
    },
    onSurfaceKeydown(event) {
      if (this.surfaceEditable && !event.defaultPrevented && !event.isComposing && !event.altKey
        && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); event.stopPropagation(); this.$refs.linkMenu?.open?.();
      }
      if (!event.defaultPrevented) this.$emit('keydown', event);
    },
    async fetchSuggestionSource(path, { signal }) {
      if (path !== this.codeSuggestionsConfig?.blobRawPath) throw new Error('GITLAB_SUGGESTION_CONTEXT_CHANGED');
      const url = new URL(path, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin
        || url.username || url.password || url.hash || !/\/-\/raw\//u.test(url.pathname))
        throw new Error('GITLAB_SUGGESTION_SOURCE_ENDPOINT_REFUSED');
      const { data } = await axios.get(url.href, { signal, responseType: 'text', transformResponse: [value => value] });
      if (signal.aborted || this.disposed) throw new DOMException('GITLAB_SUGGESTION_CANCELLED', 'AbortError');
      if (typeof data !== 'string' || data.length > 1048576) throw new Error('GITLAB_SUGGESTION_SOURCE_INVALID');
      return data;
    },
    async insertSuggestion() {
      try {
        this.ensureNoSourceDraft();
        const result = await this.contentEditor.suggestions.insertVerified();
        if (result.status === 'applied' && !this.disposed) this.focus();
      }
      catch (error) { this.onSurfaceError(error); }
    },
    async fetchQuickActions({ signal }) {
      const endpoint = this.autocompleteDataSources.commands;
      if (typeof endpoint !== 'string' || !endpoint) throw new Error('GITLAB_QUICK_ACTION_ENDPOINT_UNAVAILABLE');
      const url = new URL(endpoint, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin
        || url.username || url.password || url.hash) throw new Error('GITLAB_QUICK_ACTION_ENDPOINT_REFUSED');
      if (this.quickActionCache?.url === url.href && Date.now() - this.quickActionCache.time < 10000)
        return this.quickActionCache.items;
      const { data } = await axios.get(url.href, { signal });
      if (signal.aborted || this.disposed) throw new DOMException('GITLAB_QUICK_ACTION_CANCELLED', 'AbortError');
      if (JSON.stringify(data).length > 1024 * 1024) throw new Error('GITLAB_QUICK_ACTION_RESPONSE_TOO_LARGE');
      const items = parseGitLabQuickActionCommands(data);
      this.quickActionCache = { url: url.href, items, time: Date.now() };
      return items;
    },
    async uploadFile(file, { signal, reportProgress }) {
      if (!this.canUpload) throw new Error('GITLAB_UPLOAD_DISABLED');
      const url = new URL(this.uploadsPath, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin
        || url.username || url.password || url.hash)
        throw new Error('GITLAB_UPLOAD_ENDPOINT_REFUSED');
      const configured = Number(gon.max_file_size);
      const limit = Number.isFinite(configured) && configured > 0 ? configured : 10;
      if (file.size > limit * 1024 * 1024) throw new Error('GITLAB_UPLOAD_TOO_LARGE');
      const body = new FormData();
      body.append('file', file, file.name);
      const { data } = await axios.post(url.href, body, { signal,
        onUploadProgress: event => { if (event.total > 0) reportProgress(event.loaded / event.total); },
      });
      const response = data?.link ?? data;
      if (typeof response?.markdown !== 'string' || !response.markdown || response.markdown.length > 16384)
        throw new Error('GITLAB_INVALID_UPLOAD_RESPONSE');
      return response.markdown;
    },
    attachFiles(files) { return this.uploadFiles(files); },
    replaceMediaFile({ file, target }) { return this.uploadFiles([file], target).catch(error => this.onSurfaceError(error)); },
    async uploadFiles(files, replacementTarget) {
      if (replacementTarget && files.length !== 1) {
        replacementTarget.close();
        throw new Error('GITLAB_MEDIA_REPLACEMENT_FILE_REQUIRED');
      }
      if (!this.canUpload) { replacementTarget?.close(); throw new Error('GITLAB_UPLOAD_DISABLED'); }
      if (files.length > this.contentEditor.availableUploadSlots) {
        replacementTarget?.close();
        this.onSurfaceError(new Error('GITLAB_UPLOAD_QUEUE_FULL'));
        return;
      }
      if (this.failureCode === 'GITLAB_UPLOAD_QUEUE_FULL') this.failure = null;
      const active = document.activeElement;
      const ownsFocus = active === document.body || this.$refs.surface.$el.contains(active)
        || this.$el.querySelector('[data-testid="formatting-toolbar"]').contains(active);
      let selectionMoved = false;
      let previous = this.contentEditor.editor.state.selection;
      const release = this.contentEditor.editor.subscribe((state, transaction) => {
        if (transaction.selectionSet && !transaction.getMeta('gitlab$insertionOrigin')
          && !state.selection.eq(previous)) selectionMoved = true;
        previous = state.selection;
      });
      try {
        const results = await Promise.allSettled(files.map(file => replacementTarget
          ? this.contentEditor.replaceMediaAttachment(file, replacementTarget)
          : this.contentEditor.uploadAttachment(file)));
        if (!this.disposed && !selectionMoved && ownsFocus && document.activeElement === active
          && results.length && results.every(result => result.status === 'fulfilled' && result.value.status === 'applied'))
          this.$refs.surface.revealSelection();
      } finally { release(); }
    },
    async retryUpload(id) {
      await Promise.allSettled([this.contentEditor.retryUpload(id)]);
    },
    cancelUpload(id) {
      this.contentEditor.cancelUpload(id);
    },
    uploadMessage(upload) {
      if (upload.errorCode === 'GITLAB_UPLOAD_TOO_LARGE')
        return s__('ContentEditor|This file exceeds the upload limit for this GitLab instance.');
      if (!this.canRetryUpload(upload))
        return s__('ContentEditor|The original media changed or the uploaded file has a different type. The replacement was not applied. Remove this upload and choose the media again.');
      if (upload.errorCode === 'GITLAB_INSERTION_TARGET_CHANGED')
        return s__('ContentEditor|The insertion target changed. Your file is retained; retry at the current cursor.');
      if (upload.status === 'failed')
        return s__('ContentEditor|Upload or insertion failed. Retry or remove this file.');
      if (upload.status === 'queued') return s__('ContentEditor|Queued');
      if (upload.status === 'inserting') return s__('ContentEditor|Inserting uploaded content');
      return s__('ContentEditor|Uploading');
    },
    canRetryUpload(upload) {
      return upload.operation !== 'replace-media' || !['GITLAB_INSERTION_TARGET_CHANGED',
        'GITLAB_MEDIA_TARGET_CHANGED', 'GITLAB_MEDIA_SESSION_CLOSED',
        'GITLAB_MEDIA_REPLACEMENT_KIND_MISMATCH'].includes(upload.errorCode);
    },
    describeLabels(action, count) {
      if (action === 'add')
        return sprintf(
          n__('ContentEditor|Adds %{count} label.', 'ContentEditor|Adds %{count} labels.', count),
          { count },
        );
      if (action === 'remove')
        return sprintf(
          n__(
            'ContentEditor|Removes %{count} label.',
            'ContentEditor|Removes %{count} labels.',
            count,
          ),
          { count },
        );
      return sprintf(
        n__(
          'ContentEditor|Replaces all labels with %{count} label.',
          'ContentEditor|Replaces all labels with %{count} labels.',
          count,
        ),
        { count },
      );
    },
    async setSerializedContent(markdown, options) {
      this.loadRequest += 1;
      const request = this.loadRequest;
      this.loadOptions = options && { ...options };
      this.isLoading = true;
      this.$emit('loading');
      try {
        const result = await this.contentEditor.setSerializedContent(markdown, options);
        if (this.disposed || request !== this.loadRequest || result.status !== 'applied') return;
        this.waitingForWikiFile = this.contentEditor.waitingForWikiFile;
        this.latestMarkdown = this.waitingForWikiFile ? null : this.collaborationProvider ? this.contentEditor.getSerializedContent() : markdown;
        if (!this.waitingForWikiFile && this.latestMarkdown !== markdown) this.$emit('change', {markdown:this.latestMarkdown});
        this.failure = null;
        this.loadFailed = false;
        this.isLoading = false;
        await this.$nextTick();
        if (this.disposed || request !== this.loadRequest) return;
        markdownEditorEventHub.$emit(CONTENT_EDITOR_READY_EVENT);
        if (this.autofocus === 'all') selectAll(this.contentEditor.editor);
        if (this.autofocus) {
          const position = ['start', 'end'].includes(this.autofocus) ? this.autofocus : 'current';
          this.$refs.surface?.focus(position);
        }
      } catch (error) {
        if (!this.disposed && request === this.loadRequest) {
          this.loadFailed = true;
          this.onSurfaceError(error);
        }
      } finally {
        if (!this.disposed && request === this.loadRequest) {
          this.isLoading = false;
          this.hasRecovery = Boolean(this.contentEditor.recovery);
        }
      }
    },
    // eslint-disable-next-line vue/no-unused-properties -- Public MarkdownEditor handoff contract.
    getSerializedContentForHandoff() {
      this.ensureNoSourceDraft();
      if (this.collaborationProvider && this.wikiUploadPending) throw new Error('GITLAB_WIKI_UPLOAD_PENDING');
      if (this.isLoading || this.fatal || (!this.collaborationProvider && this.latestMarkdown !== this.markdown))
        throw new Error('MARKDOWN_SERIALIZATION_NOT_READY');
      return this.$refs.surface.getSerializedContentForHandoff();
    },
    readSerializedContent() {
      this.ensureNoSourceDraft();
      return this.contentEditor.getSerializedContent();
    },
    ensureNoSourceDraft() {
      if (this.$refs.codeMenu?.hasUnappliedSource) throw new Error('GITLAB_CODE_SOURCE_DRAFT_PENDING');
    },
    onDocumentChange(change) {
      this.waitingForWikiFile = this.contentEditor.waitingForWikiFile;
      if (this.waitingForWikiFile) return;
      if (change.status !== 'ready') {
        this.onSurfaceError(change.error);
        return;
      }
      this.latestMarkdown = change.markdown;
      this.failure = null;
      this.$emit('change', { markdown: change.markdown });
    },
    onSurfaceError(error) {
      this.$refs.linkMenu?.refreshRoot?.();
      this.failure = error;
      this.failedInsertionSource = this.contentEditor?.insertionRecovery?.markdown ?? null;
    },
    async pasteContent(markdown) {
      try {
        const result = await this.contentEditor.pasteMarkdown(markdown);
        if (result.status === 'applied' && !this.disposed) {
          this.failedInsertionSource = null;
          this.focus();
        }
      } catch (error) {
        if (!this.disposed) this.onSurfaceError(error);
      }
    },
    retryLoad() {
      return this.setSerializedContent(
        this.contentEditor.recovery?.markdown ?? this.markdown,
        this.loadOptions,
      );
    },
    keepCurrentDocument() {
      try {
        this.contentEditor.keepCurrentDocument();
        this.failure = null;
        this.loadFailed = false;
      } catch (error) {
        this.onSurfaceError(error);
      }
    },
    focus() {
      this.$refs.surface?.focus();
    },
    onFocus() {
      this.focused = true;
      this.$emit('focus');
    },
    onBlur() {
      this.focused = false;
      this.$emit('blur');
    },
    handleEditorModeChanged() {
      this.$emit('enable-markdown-editor');
    },
  },
};
</script>
<template>
  <div
    class="md-area"
    :class="{ 'immersive !gl-border-none !gl-bg-inherit': immersive, 'gl-relative': !immersive }"
    data-testid="content-editor-container"
    data-fountain-integration="native"
    :data-fountain-error="failureCode"
  >
    <gl-alert v-if="immersive && adapterGaps && !fatal" variant="warning" :dismissible="false">
      {{ editingLimitsMessage }}
    </gl-alert>
    <gl-alert v-if="failure" data-testid="content-editor-error" variant="danger" :dismissible="false">
      {{ failureMessage }}
      <gl-button v-if="hasRecovery" size="small" @click="retryLoad">{{
        s__('ContentEditor|Retry source')
      }}</gl-button>
      <gl-button v-if="hasRecovery" size="small" @click="keepCurrentDocument">{{
        s__('ContentEditor|Keep current document')
      }}</gl-button>
    </gl-alert>
    <details v-if="hasRecovery" class="gl-p-3">
      <summary>{{ s__('ContentEditor|Retained document source') }}</summary>
      <p class="gl-mt-3">
        {{ s__('ContentEditor|You can copy this original Markdown before choosing a recovery action. It remains available here while this editor is open.') }}
      </p>
      <textarea
        :value="replacementSource"
        :aria-label="s__('ContentEditor|Retained document Markdown')"
        readonly
        class="gl-w-full"
        rows="6"
      ></textarea>
    </details>
    <div v-if="peerUploadNames.length" role="status" class="gl-m-3">
      {{ s__('ContentEditor|Another author is attaching a file. You can keep editing and save when it finishes.') }}
      <ul :aria-label="s__('ContentEditor|Files being attached by other authors')">
        <li v-for="(name, index) in peerUploadNames" :key="index">{{ name }}</li>
      </ul>
    </div>
    <p v-if="waitingForWikiFile" role="status" class="gl-m-3">
      {{ s__('ContentEditor|An attachment is uploading in another editor. You can keep editing. Save becomes available when the file is ready.') }}
    </p>
    <ul v-if="uploads.length" :aria-label="s__('ContentEditor|Attachment uploads')" class="gl-m-3 gl-list-none gl-p-0">
      <li v-for="upload in uploads" :key="upload.id" class="gl-mb-3 gl-rounded-base gl-border gl-p-3">
        <span class="gl-font-bold">{{ upload.fileName }}</span>
        <span role="status">{{ uploadMessage(upload) }}</span>
        <details v-if="upload.source" class="gl-mt-3">
          <summary>{{ s__('ContentEditor|Uploaded file Markdown') }}</summary>
          <textarea :value="upload.source" :aria-label="s__('ContentEditor|Uploaded file source')" readonly class="gl-w-full" rows="3"></textarea>
        </details>
        <progress v-if="upload.status === 'uploading'" :value="upload.progress" max="1" :aria-label="s__('ContentEditor|File upload progress')"></progress>
        <gl-button v-if="upload.status === 'failed' && canRetryUpload(upload)" :disabled="!canUpload" size="small" @click="retryUpload(upload.id)">{{ s__('ContentEditor|Retry upload') }}</gl-button>
        <gl-button size="small" @click="cancelUpload(upload.id)">{{ upload.status === 'failed' ? s__('ContentEditor|Remove upload') : s__('ContentEditor|Cancel upload') }}</gl-button>
      </li>
    </ul>
    <details v-if="failedInsertionSource !== null" class="gl-p-3">
      <summary>{{ s__('ContentEditor|Retained paste source') }}</summary>
      <textarea
        :value="failedInsertionSource"
        :aria-label="s__('ContentEditor|Failed paste source')"
        readonly
        class="gl-w-full"
        rows="4"
      ></textarea>
      <gl-button
        size="small"
        :disabled="!editable || inserting || isLoading"
        @click="pasteContent(failedInsertionSource)"
        >{{ s__('ContentEditor|Retry paste at cursor') }}</gl-button
      >
    </details>
    <div
      data-testid="content-editor"
      class="content-editor-body gl-relative"
      :class="{ 'is-focused': focused }"
    >
      <div
        data-testid="content-editor-header"
        :class="{ 'gl-sticky gl-top-0 gl-z-3 gl-bg-default': immersive }"
      >
        <slot name="header"></slot>
        <fountain-formatting-toolbar
          v-if="contentEditor"
          :editor="contentEditor.editor"
          :content-editor="contentEditor"
          :disabled="!surfaceEditable"
          :get-editor-root="getEditorRoot"
          :supports-table-of-contents="supportsTableOfContents"
          :hide-attachment-button="disableAttachments || !uploadsPath"
          @focus="focus"
          @error="onSurfaceError"
          @paste-markdown="pasteContent"
          @attach-files="attachFiles"
        >
          <template #context-actions>
            <fountain-link-menu ref="linkMenu" :content-editor="contentEditor" :get-editor-root="getEditorRoot" :disabled="!surfaceEditable" @focus="focus" @error="onSurfaceError" />
            <code-block-bubble-menu ref="codeMenu" :content-editor="contentEditor" :configuration="codeSuggestionsConfig" :get-editor-root="getEditorRoot" :disabled="!surfaceEditable" @focus="focus" @error="onSurfaceError" />
            <fountain-reference-menu :content-editor="contentEditor" :disabled="!surfaceEditable" @focus="focus" />
            <fountain-alert-menu :content-editor="contentEditor" :disabled="!surfaceEditable" @focus="focus" @error="onSurfaceError" />
            <fountain-quick-action-menu ref="quickActionMenu" :content-editor="contentEditor" :get-editor-root="getEditorRoot" :disabled="!surfaceEditable" @focus="focus" @error="onSurfaceError" />
          </template>
          <template #clipboard-actions>
            <media-bubble-menu ref="mediaMenu" :content-editor="contentEditor" :get-editor-root="getEditorRoot" :disabled="!surfaceEditable" :allow-upload="canUpload" @focus="focus" @error="onSurfaceError" @replace-file="replaceMediaFile" />
          </template>
          <template #header-buttons>
            <comment-templates-modal
              v-if="surfaceEditable && commentTemplatePaths.length"
              :new-comment-template-paths="commentTemplatePaths"
              @select="pasteContent"
            />
            <gl-button v-if="codeSuggestionsConfig && codeSuggestionsConfig.canSuggest" size="small" icon="comment" :disabled="!surfaceEditable || inserting" @click="insertSuggestion">{{ s__('ContentEditor|Insert suggestion') }}</gl-button>
            <slot name="header-buttons"></slot>
            <editor-mode-switcher
              v-if="immersive && !hideModeSwitcher"
              size="small"
              value="richText"
              @switch="handleEditorModeChanged"
            />
          </template>
        </fountain-formatting-toolbar>
      </div>
      <gl-loading-icon v-if="isLoading || inserting" size="lg" class="gl-p-5" />
      <fountain-editor-surface
        v-if="contentEditor"
        ref="surface"
        class="md"
        data-testid="content_editor_editablebox"
        :editor="contentEditor.editor"
        :options="surfaceOptions"
        :editable="surfaceEditable"
        :read-serialized-content="readSerializedContent"
        @error="onSurfaceError"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onSurfaceKeydown"
        @ready="onSurfaceReady"
      />
    </div>
    <div
      v-if="!immersive"
      data-testid="content-editor-footer"
      class="gl-border-t gl-flex gl-flex-wrap gl-items-center gl-justify-between gl-gap-2 gl-p-2"
    >
      <editor-mode-switcher
        v-if="!hideModeSwitcher"
        size="small"
        value="richText"
        @switch="handleEditorModeChanged"
      />
      <slot name="toolbar"></slot>
      <details v-if="adapterGaps && !fatal" class="fountain-gitlab-editing-limits gl-text-sm">
        <summary>{{ s__('ContentEditor|Rich-text editing limits') }}</summary>
        <p class="gl-mb-0 gl-mt-2">{{ editingLimitsMessage }}</p>
      </details>
      <gl-button :href="markdownDocsPath" target="_blank" category="tertiary" size="small">{{
        s__('ContentEditor|Markdown help')
      }}</gl-button>
    </div>
  </div>
</template>
<style scoped>
.fountain-gitlab-editing-limits[open] {
  flex-basis: 100%;
}
</style>
