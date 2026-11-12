<script>
import { GlAlert, GlButton, GlLoadingIcon } from '@gitlab/ui';
import { markRaw } from 'vue';
import katex from 'katex';
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

export default {
  name: 'FountainContentEditor',
  components: {
    GlAlert,
    GlButton,
    GlLoadingIcon,
    EditorModeSwitcher,
    FountainEditorSurface,
    FountainFormattingToolbar,
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
      inserting: false,
      failedInsertionSource: null,
    };
  },
  computed: {
    failureMessage() {
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
      };
    },
    adapterGaps() {
      return (
        this.enableAutocomplete ||
        Object.keys(this.autocompleteDataSources).length > 0 ||
        this.supportsQuickActions ||
        this.supportsTableOfContents ||
        this.drawioEnabled ||
        (!this.disableAttachments && Boolean(this.uploadsPath)) ||
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
        }),
      );
      this.releaseChange = this.contentEditor.subscribeChange(this.onDocumentChange);
      this.releaseStatus = this.contentEditor.subscribeStatus(() => {
        this.hasRecovery = Boolean(this.contentEditor.recovery);
        this.inserting = this.contentEditor.pendingInsertions > 0;
      });
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
    this.contentEditor?.dispose();
  },
  methods: {
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
      this.isLoading = true;
      this.$emit('loading');
      try {
        const result = await this.contentEditor.setSerializedContent(markdown, options);
        if (this.disposed || request !== this.loadRequest || result.status !== 'applied') return;
        this.latestMarkdown = markdown;
        this.failure = null;
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
        if (!this.disposed && request === this.loadRequest) this.onSurfaceError(error);
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
      return this.setSerializedContent(this.contentEditor.recovery?.markdown ?? this.markdown);
    },
    keepCurrentDocument() {
      try {
        this.contentEditor.keepCurrentDocument();
        this.failure = null;
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
    class="md-area gl-relative"
    data-testid="content-editor-container"
    data-fountain-integration="native"
    :data-fountain-error="failureCode"
  >
    <gl-alert v-if="adapterGaps && !fatal" variant="warning" :dismissible="false">
      {{
        s__(
          'ContentEditor|This integration is unfinished. Autocomplete, attachments, saved replies, quick actions and specialized menus are not connected yet. Use source editing for those workflows.',
        )
      }}
    </gl-alert>
    <gl-alert v-if="failure" variant="danger" :dismissible="false">
      {{ failureMessage }}
      <gl-button v-if="hasRecovery" size="small" @click="retryLoad">{{
        s__('ContentEditor|Retry source')
      }}</gl-button>
      <gl-button v-if="hasRecovery" size="small" @click="keepCurrentDocument">{{
        s__('ContentEditor|Keep current document')
      }}</gl-button>
    </gl-alert>
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
      <div data-testid="content-editor-header">
        <slot name="header"></slot>
        <fountain-formatting-toolbar
          v-if="contentEditor"
          :editor="contentEditor.editor"
          :disabled="!editable || isLoading"
          @focus="focus"
          @error="onSurfaceError"
          @paste-markdown="pasteContent"
        >
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
        :editable="editable && !isLoading"
        :read-serialized-content="readSerializedContent"
        @error="onSurfaceError"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="$emit('keydown', $event)"
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
