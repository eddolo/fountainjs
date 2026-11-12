<script>
import { GlAlert, GlButton, GlLoadingIcon } from '@gitlab/ui';
import { markRaw } from 'vue';
import katex from 'katex';
import axios from '~/lib/utils/axios_utils';
import { s__, n__, sprintf } from '~/locale';
import EditorModeSwitcher from '~/vue_shared/components/markdown/editor_mode_switcher.vue';
import { CONTENT_EDITOR_READY_EVENT, CONTENT_EDITOR_PASTE } from '~/vue_shared/constants';
import markdownEditorEventHub from '~/vue_shared/components/markdown/eventhub';
import { TIPTAP_AUTOFOCUS_OPTIONS } from '../constants';
import {
  GitLabContentEditor,
  createKaTeXRenderer,
  selectAll,
  assertGitLabNativeHostConfiguration,
} from '../runtime/browser';
import FountainEditorSurface from './fountain_editor_surface.vue';
import FountainFormattingToolbar from './fountain_formatting_toolbar.vue';
import FountainLinkMenu from './fountain_link_menu.vue';
import FountainCodeMenu from './fountain_code_menu.vue';

export default {
  name: 'FountainContentEditor',
  components: {
    GlAlert,
    GlButton,
    GlLoadingIcon,
    EditorModeSwitcher,
    FountainEditorSurface,
    FountainFormattingToolbar,
    FountainLinkMenu,
    FountainCodeMenu,
  },
  // The installer inserts the pinned host's exact public prop definitions here.
  props: {},
  emits: ['blur', 'change', 'enable-markdown-editor', 'focus', 'initialized', 'keydown', 'loading'],
  data() {
    return {
      focused: false,
      isLoading: false,
      latestMarkdown: null,
      failure: null,
      fatal: false,
      hasRecovery: false,
      replacementSource: null,
      inserting: false,
      failedInsertionSource: null,
      loadFailed: false,
      uploads: [],
    };
  },
  computed: {
    surfaceEditable() {
      return this.editable && !this.isLoading && !this.loadFailed && !this.fatal;
    },
    canUpload() {
      return this.surfaceEditable && !this.disableAttachments && Boolean(this.uploadsPath);
    },
    failureMessage() {
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
    adapterGaps() {
      return (
        this.enableAutocomplete ||
        Object.keys(this.autocompleteDataSources).length > 0 ||
        this.supportsQuickActions ||
        this.supportsTableOfContents ||
        this.drawioEnabled ||
        this.newCommentTemplatePaths.length > 0
      );
    },
  },
  watch: {
    markdown(value) {
      if (value !== this.latestMarkdown && this.contentEditor)
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
    try {
      assertGitLabNativeHostConfiguration({
        collaborationProvider: this.collaborationProvider,
        serializerConfig: this.serializerConfig,
        codeSuggestionsConfig: this.codeSuggestionsConfig,
      });
      this.contentEditor = markRaw(
        new GitLabContentEditor({
          renderMarkdown: (markdown, options) =>
            this.renderMarkdown(markdown, { ...options, noHeaderAnchors: true }),
          describeLabels: this.describeLabels,
          editable: this.editable,
          extensions: this.extensions,
          renderMath: createKaTeXRenderer(katex),
          onListenerError: this.onSurfaceError,
          uploadAttachment: this.uploadFile,
        }),
      );
      this.releaseChange = this.contentEditor.subscribeChange(this.onDocumentChange);
      this.releaseStatus = this.contentEditor.subscribeStatus(() => {
        this.hasRecovery = Boolean(this.contentEditor.recovery);
        this.replacementSource = this.contentEditor.recovery?.markdown ?? null;
        this.inserting = this.contentEditor.pendingInsertions > 0;
      });
      this.releaseUploads = this.contentEditor.subscribeUploads(uploads => { this.uploads = uploads; });
    } catch (error) {
      this.fatal = true;
      this.onSurfaceError(error);
    }
  },
  async mounted() {
    this.$emit('initialized');
    markdownEditorEventHub.$on(CONTENT_EDITOR_PASTE, this.pasteContent);
    if (this.contentEditor) await this.setSerializedContent(this.markdown);
  },
  beforeDestroy() {
    markdownEditorEventHub.$off(CONTENT_EDITOR_PASTE, this.pasteContent);
    this.disposed = true;
    this.loadRequest += 1;
    this.releaseChange?.();
    this.releaseStatus?.();
    this.releaseUploads?.();
    this.contentEditor?.dispose();
  },
  methods: {
    getEditorRoot() { return this.$refs.surface?.getRootElement(); },
    onSurfaceReady() { this.$refs.linkMenu?.refreshRoot?.(); },
    onSurfaceKeydown(event) {
      if (this.surfaceEditable && !event.defaultPrevented && !event.isComposing && !event.altKey
        && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); event.stopPropagation(); this.$refs.linkMenu?.open?.();
      }
      this.$emit('keydown', event);
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
    async attachFiles(files) {
      if (!this.canUpload) throw new Error('GITLAB_UPLOAD_DISABLED');
      if (files.length > this.contentEditor.availableUploadSlots) {
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
        const results = await Promise.allSettled(files.map(file => this.contentEditor.uploadAttachment(file)));
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
      if (upload.errorCode === 'GITLAB_INSERTION_TARGET_CHANGED')
        return s__('ContentEditor|The insertion target changed. Your file is retained; retry at the current cursor.');
      if (upload.status === 'failed')
        return s__('ContentEditor|Upload or insertion failed. Retry or remove this file.');
      if (upload.status === 'queued') return s__('ContentEditor|Queued');
      if (upload.status === 'inserting') return s__('ContentEditor|Inserting uploaded content');
      return s__('ContentEditor|Uploading');
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
        this.latestMarkdown = markdown;
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
      if (this.isLoading || this.fatal || this.latestMarkdown !== this.markdown)
        throw new Error('MARKDOWN_SERIALIZATION_NOT_READY');
      return this.$refs.surface.getSerializedContentForHandoff();
    },
    readSerializedContent() {
      return this.contentEditor.getSerializedContent();
    },
    onDocumentChange(change) {
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
    <gl-alert v-if="adapterGaps && !fatal" variant="warning" :dismissible="false">
      {{
        s__(
          'ContentEditor|This integration is unfinished. Autocomplete, saved replies, quick actions and specialized menus are not connected yet. Use source editing for those workflows.',
        )
      }}
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
    <ul v-if="uploads.length" :aria-label="s__('ContentEditor|Attachment uploads')" class="gl-m-3 gl-list-none gl-p-0">
      <li v-for="upload in uploads" :key="upload.id" class="gl-mb-3 gl-rounded-base gl-border gl-p-3">
        <span class="gl-font-bold">{{ upload.fileName }}</span>
        <span role="status">{{ uploadMessage(upload) }}</span>
        <details v-if="upload.source" class="gl-mt-3">
          <summary>{{ s__('ContentEditor|Uploaded file Markdown') }}</summary>
          <textarea :value="upload.source" :aria-label="s__('ContentEditor|Uploaded file source')" readonly class="gl-w-full" rows="3"></textarea>
        </details>
        <progress v-if="upload.status === 'uploading'" :value="upload.progress" max="1" :aria-label="s__('ContentEditor|File upload progress')"></progress>
        <gl-button v-if="upload.status === 'failed'" :disabled="!canUpload" size="small" @click="retryUpload(upload.id)">{{ s__('ContentEditor|Retry upload') }}</gl-button>
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
          :disabled="!surfaceEditable"
          :hide-attachment-button="disableAttachments || !uploadsPath"
          @focus="focus"
          @error="onSurfaceError"
          @paste-markdown="pasteContent"
          @attach-files="attachFiles"
        >
          <template #context-actions>
            <fountain-link-menu ref="linkMenu" :content-editor="contentEditor" :get-editor-root="getEditorRoot" :disabled="!surfaceEditable" @focus="focus" @error="onSurfaceError" />
            <fountain-code-menu :content-editor="contentEditor" :disabled="!surfaceEditable" @focus="focus" @error="onSurfaceError" />
          </template>
          <template #header-buttons>
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
      class="gl-border-t gl-flex gl-items-center gl-justify-between gl-p-2"
    >
      <editor-mode-switcher
        v-if="!hideModeSwitcher"
        size="small"
        value="richText"
        @switch="handleEditorModeChanged"
      />
      <slot name="toolbar"></slot>
      <gl-button :href="markdownDocsPath" target="_blank" category="tertiary" size="small">{{
        s__('ContentEditor|Markdown help')
      }}</gl-button>
    </div>
  </div>
</template>
