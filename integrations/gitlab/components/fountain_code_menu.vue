<script>
import { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlFormCheckbox, GlFormTextarea, GlModal } from '@gitlab/ui';
import { markRaw } from 'vue';
import { uniqueId } from 'lodash-es';
import { s__ } from '~/locale';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import CODE_BLOCK_LANGUAGES from '../constants/code_block_languages';
import { getGitLabCodeContext, gitLabSuggestionDeletesLines } from '../runtime/browser';
import FountainDiagramPreview from './fountain_diagram_preview.vue';
import FountainContextSurface from './fountain_context_surface.vue';

export default {
  name: 'FountainCodeMenu',
  components: { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlFormCheckbox, GlFormTextarea, GlModal, FountainDiagramPreview, FountainContextSurface },
  props: {
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
    getEditorRoot: { type: Function, required: false, default: null },
    configuration: { type: Object, required: false, default: null },
  },
  emits: ['focus', 'error'],
  data() {
    return { context: null, session: null, language: '', errorCode: null, copyState: null, showPreview: false,
      inputId: uniqueId('fountain-code-language-'), revision: 0,
      dialogOpen: false, dialogContext: null, sourceSession: null, sourceDraft: '', sourceError: null,
      sourceCopyState: null, sourceDeletionConfirmed: false, sourceComposing: false, sourceApplying: false, sourceRangeEnabled: false, rangeStart: 1, rangeEnd: 1, rangeLoading: false, fileLines: null, modalId: uniqueId('fountain-diagram-source-') };
  },
  computed: {
    visible() { return Boolean(this.context || this.session || this.dialogOpen); },
    menuAnchorPath() {
      if (this.revision < 0) return null;
      const session = this.sourceSession || this.session;
      return session ? session.targetPath || null : this.context?.path || this.dialogContext?.path || null;
    },
    conflict() { return this.revision >= 0 && Boolean(this.session?.conflict || this.session?.closed); },
    menuContext() { return this.session?.initial || this.context; },
    languages() {
      if (this.menuContext?.frontmatter === 'header') return [{ syntax: 'yaml', label: 'YAML' }, { syntax: 'toml', label: 'TOML' }, { syntax: 'json', label: 'JSON' }];
      return [{ syntax: 'mermaid', label: s__('ContentEditor|Mermaid diagram') }, { syntax: 'plantuml', label: s__('ContentEditor|PlantUML diagram') }, ...CODE_BLOCK_LANGUAGES];
    },
    isFrontmatter() { return Boolean(this.menuContext?.frontmatter); },
    isDiagram() { return !this.isFrontmatter && ['mermaid', 'plantuml'].includes(this.menuContext?.language); },
    isSuggestion() { return Boolean(this.menuContext?.suggestion); },
    sourceDeletesLines() { return this.sourceIsSuggestion && gitLabSuggestionDeletesLines(this.sourceDraft); },
    sourceWhitespaceDeletion() { return this.sourceDeletesLines && this.sourceDraft.length > 0; },
    sourceIsSuggestion() { return Boolean(this.dialogContext?.suggestion); },
    rangePreview() {
      if (!this.fileLines) return '';
      const start = Math.max(0, Math.min(this.fileLines.length - 1, Number(this.rangeStart) - 4 || 0));
      return this.fileLines.slice(start, start + 100).map((line, index) => `${start + index + 1}: ${line}`).join('\n');
    },
    sourceIsFrontmatter() { return Boolean(this.dialogContext?.frontmatter); },
    sourceTitle() { if (this.sourceIsSuggestion) return s__('ContentEditor|Suggested replacement'); return this.sourceIsFrontmatter ? s__('ContentEditor|Frontmatter source') : s__('ContentEditor|Diagram source and preview'); },
    sourceLabel() { if (this.sourceIsSuggestion) return s__('ContentEditor|Replacement source'); return this.sourceIsFrontmatter ? s__('ContentEditor|Frontmatter source') : s__('ContentEditor|Diagram source'); },
    // The host reads this before saving or switching editing mode.
    hasUnappliedSource() { return this.dialogOpen && (this.sourceApplying || this.sourceDraft !== this.dialogContext?.text
      || this.sourceRangeEnabled && (Number(this.rangeStart) !== this.sourceSession?.initial.range.start || Number(this.rangeEnd) !== this.sourceSession?.initial.range.end)); },
    sourceConflict() { return this.revision >= 0 && Boolean(this.sourceSession?.conflict || this.sourceSession?.closed); },
    sourceAction() {
      if (this.disabled) return null;
      return { text: this.sourceIsSuggestion ? (this.sourceDeletesLines ? s__('ContentEditor|Apply deletion') : s__('ContentEditor|Apply suggestion')) : this.sourceIsFrontmatter ? s__('ContentEditor|Apply frontmatter source') : s__('ContentEditor|Apply diagram source'), attributes: { variant: 'confirm',
        disabled: !this.sourceSession || this.sourceConflict || this.sourceComposing || this.sourceApplying || this.rangeLoading || this.sourceWhitespaceDeletion && !this.sourceDeletionConfirmed, loading: this.sourceApplying } };
    },
    sourceCancel() {
      if (!this.disabled) return { text: s__('ContentEditor|Cancel source edit') };
      return { text: this.sourceIsSuggestion ? s__('ContentEditor|Close suggestion source') : this.sourceIsFrontmatter ? s__('ContentEditor|Close frontmatter source') : s__('ContentEditor|Close diagram source') };
    },
    focusTarget() { return { focus: () => { if (!this.disposed) this.$emit('focus'); } }; },
    sourceMessage() {
      if (this.sourceIsSuggestion) {
        if (this.sourceConflict) return s__('ContentEditor|This suggestion or its file context changed. Your draft is retained. Copy it before closing and reopen the current suggestion.');
        if (this.sourceError) return s__('ContentEditor|The suggestion could not be applied. Your draft and document are retained. Load the original file before expanding the range, check the file lines, and try again.');
        return '';
      }
      if (this.sourceConflict)
        return this.sourceIsFrontmatter ? s__('ContentEditor|This frontmatter block changed or was replaced. Your source draft is retained. Copy it before closing and reopen the current block.') : s__('ContentEditor|This diagram changed or was replaced. Your source draft is retained. Copy it before closing and reopen the current block.');
      if (this.sourceError)
        return this.sourceIsFrontmatter ? s__('ContentEditor|The header could not be applied. A delimiter on its own line can close frontmatter. Your draft and document are retained. Check the source and try again.') : s__('ContentEditor|The source could not be applied. Your draft and document are retained. Check the editor state and try again.');
      return '';
    },
    formError() {
      if (this.conflict)
        return s__('ContentEditor|This code block changed. Your language draft is retained. Cancel and select the block again.');
      if (this.errorCode === 'GITLAB_CODE_INVALID_LANGUAGE')
        return s__('ContentEditor|Enter a language label up to 80 characters using letters, numbers, underscores, dots, plus signs, hyphens or hash signs.');
      if (this.errorCode === 'GITLAB_CODE_SPECIALIZED_LANGUAGE')
        return s__('ContentEditor|This language requires a specialized GitLab adapter. The code and your draft are unchanged.');
      if (this.errorCode === 'GITLAB_FRONTMATTER_LANGUAGE')
        return s__('ContentEditor|Choose YAML, TOML or JSON for a document header. To keep another language as ordinary code, convert the block to regular code. Changing the format preserves your source; it does not translate its syntax.');
      if (this.errorCode === 'GITLAB_CODE_LANGUAGE_DRAFT_PENDING')
        return s__('ContentEditor|Apply or cancel your language draft before opening the diagram source.');
      if (this.errorCode)
        return s__('ContentEditor|The code block could not be updated. Your document and language draft are retained.');
      return '';
    },
  },
  watch: { sourceDraft() { this.sourceDeletionConfirmed = false; }, configuration: { deep: true, handler() { this.revision += 1; } } },
  created() {
    this.disposed = false;
    this.releaseState = this.contentEditor.editor.subscribe(() => this.refresh());
    this.refresh();
  },
  beforeDestroy() {
    this.disposed = true; this.releaseState(); this.session?.close(); this.sourceSession?.close();
  },
  methods: {
    // eslint-disable-next-line vue/no-unused-properties -- Called when the owning native view mounts/replaces.
    refreshRoot() { this.$refs.contextSurface?.refreshRoot(); },
    onKeydown(event) {
      if (event.key !== 'Escape' || event.isComposing || this.dialogOpen) return;
      event.preventDefault(); event.stopPropagation(); this.cancel();
    },
    refresh() {
      if (this.disposed) return;
      const context = getGitLabCodeContext(this.contentEditor.editor) || null;
      if (context?.path.join('.') !== this.context?.path.join('.') || context?.language !== this.context?.language) this.showPreview = false;
      if (context?.text !== this.context?.text || context?.language !== this.context?.language) this.copyState = null;
      this.context = context;
      this.revision += 1;
      if (!this.session) this.language = this.context?.language || '';
    },
    begin() {
      if (this.disabled || this.session) return;
      try { this.session = markRaw(this.contentEditor.beginCodeEdit()); this.errorCode = null; }
      catch (error) { this.errorCode = error.message; }
    },
    cancel() {
      this.session?.close(); this.session = null; this.errorCode = null;
      // Let the native input commit its local draft before restoring its prop.
      this.$nextTick(() => { if (!this.disposed) { this.refresh(); this.$emit('focus'); } });
    },
    apply() {
      if (this.disabled || this.conflict) return;
      this.begin(); if (!this.session) return;
      try {
        this.session.applyLanguage(this.language);
        this.session = null; this.errorCode = null; this.refresh(); this.$emit('focus');
      } catch (error) { this.errorCode = error.message; }
    },
    remove() {
      if (this.disabled || this.conflict) return;
      try {
        const session = this.session || this.contentEditor.beginCodeEdit();
        session.remove(); this.session = null; this.errorCode = null;
        this.refresh(); this.$emit('focus');
      } catch (error) { this.errorCode = error.message; }
    },
    convertToCode() {
      if (this.disabled || this.conflict) return;
      try {
        const session = this.session || this.contentEditor.beginCodeEdit();
        session.convertToCode(this.language);
        this.session = null; this.errorCode = null; this.refresh(); this.$emit('focus');
      } catch (error) { this.errorCode = error.message; }
    },
    async copy(event) {
      const context = this.menuContext;
      if (!context) return;
      try {
        await copyToClipboard(context.text, event.currentTarget);
        if (!this.disposed) this.copyState = 'copied';
      } catch { if (!this.disposed) this.copyState = 'failed'; }
    },
    openSource() {
      if ((!this.isDiagram && !this.isFrontmatter && !this.isSuggestion) || this.dialogOpen) return;
      if (this.session && this.language !== this.session.initial.language) {
        this.errorCode = 'GITLAB_CODE_LANGUAGE_DRAFT_PENDING'; return;
      }
      try {
        const context = this.menuContext;
        this.sourceRangeEnabled = this.isSuggestion && !this.disabled && this.contentEditor.suggestions.available;
        this.sourceSession = this.disabled ? null : this.sourceRangeEnabled ? markRaw(this.contentEditor.suggestions.begin()) : this.session || markRaw(this.contentEditor.beginCodeEdit());
        if (this.disabled) this.session?.close();
        this.session = null;
        this.dialogContext = { ...context, ...(this.sourceSession?.initial || {}) };
        this.rangeStart = this.sourceSession?.initial.range?.start ?? 1; this.rangeEnd = this.sourceSession?.initial.range?.end ?? 1;
        this.fileLines = null; this.rangeLoading = false; this.sourceApplying = false;
        this.sourceDraft = this.dialogContext.text; this.sourceDeletionConfirmed = false; this.sourceError = null; this.sourceCopyState = null;
        this.sourceComposing = false; this.showPreview = false; this.errorCode = null; this.dialogOpen = true;
      } catch (error) { this.errorCode = error.message; }
    },
    async loadOriginalFile() {
      const session = this.sourceSession;
      if (!session || !this.sourceRangeEnabled || this.rangeLoading || this.sourceApplying) return;
      this.rangeLoading = true; this.sourceError = null;
      try {
        const lines = await session.prepareRange();
        if (!this.disposed && this.dialogOpen && this.sourceSession === session) this.fileLines = lines;
      } catch (error) { if (!this.disposed && this.dialogOpen && this.sourceSession === session) this.sourceError = error.message; }
      finally { if (!this.disposed && this.sourceSession === session) this.rangeLoading = false; }
    },
    async applySource(event) {
      event?.preventDefault();
      if (this.disabled || this.sourceConflict || this.sourceComposing || this.sourceApplying || this.rangeLoading || this.sourceWhitespaceDeletion && !this.sourceDeletionConfirmed || !this.sourceSession) return;
      const session = this.sourceSession; this.sourceApplying = true;
      try {
        if (this.sourceRangeEnabled) await session.applyChange(this.sourceDraft, Number(this.rangeStart), Number(this.rangeEnd));
        else session.applySource(this.sourceDraft);
        if (this.disposed || !this.dialogOpen || this.sourceSession !== session) return;
        this.dialogOpen = false; this.sourceSession = null; this.sourceError = null; this.refresh();
      } catch (error) { if (!this.disposed && this.dialogOpen && this.sourceSession === session) this.sourceError = error.message; }
      finally { if (!this.disposed) this.sourceApplying = false; }
    },
    focusSourceOnShow() {
      const source = this.$refs.sourceField?.$el;
      const dialog = source?.closest('[role="dialog"]');
      if (!dialog) return;
      // A user can reach a field while the opening transition is still running.
      const active = source.ownerDocument.activeElement;
      if (dialog.contains(active) && active.tabIndex >= 0) return;
      source.focus();
    },
    hideSource(event) {
      if (event?.defaultPrevented) return;
      this.sourceSession?.close(); this.sourceSession = null; this.sourceComposing = false;
    },
    hiddenSource() { if (!this.disposed && !this.dialogOpen) this.dialogContext = null; },
    onSourceKeydown(event) {
      if (event.key === 'Escape' && (event.isComposing || this.sourceComposing)) {
        event.preventDefault(); event.stopPropagation();
      }
    },
    async copySource(event) {
      const draft = this.sourceDraft;
      try {
        await copyToClipboard(draft, event.currentTarget);
        if (!this.disposed && this.dialogOpen && this.sourceDraft === draft) this.sourceCopyState = 'copied';
      } catch { if (!this.disposed && this.dialogOpen) this.sourceCopyState = 'failed'; }
    },
  },
};
</script>
<template>
  <fountain-context-surface v-if="visible" ref="contextSurface" :editor="contentEditor.editor" :active="visible" :anchor-path="menuAnchorPath" :get-editor-root="getEditorRoot" :label="isSuggestion ? s__('ContentEditor|Suggestion actions') : s__('ContentEditor|Code block actions')" :suspended="dialogOpen" @reveal="$emit('focus')">
  <section data-testid="native-code-menu" class="gl-w-full" :aria-label="isSuggestion ? s__('ContentEditor|Suggestion controls') : s__('ContentEditor|Code block controls')" @keydown="onKeydown">
    <gl-alert v-if="formError" variant="danger" :dismissible="false" class="gl-mb-3">{{ formError }}</gl-alert>
    <p v-if="isFrontmatter" class="gl-mb-3">{{ menuContext.frontmatter === 'header' ? s__('ContentEditor|Document frontmatter stays at the beginning. Edit its literal source here or in the editor. Changing the format preserves the source; it does not translate YAML, TOML or JSON.') : s__('ContentEditor|This is a code fence labelled frontmatter, not a document header. Its fence parameter is preserved when you save.') }}</p>
    <div v-if="isSuggestion" class="gl-flex gl-flex-wrap gl-gap-3">
      <gl-button size="small" @click="openSource">{{ disabled ? s__('ContentEditor|View suggestion source') : s__('ContentEditor|Edit suggestion') }}</gl-button>
      <gl-button size="small" @click="copy">{{ s__('ContentEditor|Copy replacement') }}</gl-button>
      <gl-button size="small" variant="danger" category="secondary" :disabled="disabled" @click="remove">{{ s__('ContentEditor|Delete suggestion') }}</gl-button>
    </div>
    <gl-form v-if="!isSuggestion" class="gl-flex gl-flex-wrap gl-items-end gl-gap-3" @submit.stop.prevent="apply">
      <gl-form-group :label="menuContext?.frontmatter === 'header' ? s__('ContentEditor|Frontmatter format') : s__('ContentEditor|Code language')" :label-for="inputId" class="gl-mb-0 gl-max-w-full">
        <gl-form-input :id="inputId" v-model="language" :list="`${inputId}-options`" :disabled="disabled || conflict" :maxlength="80" autocomplete="off" @focus="begin" />
        <datalist :id="`${inputId}-options`">
          <option v-for="item in languages" :key="item.syntax" :value="item.syntax">{{ item.label }}</option>
        </datalist>
      </gl-form-group>
      <gl-button type="submit" size="small" :disabled="disabled || conflict || !language.trim()">{{ menuContext?.frontmatter === 'header' ? s__('ContentEditor|Apply frontmatter format') : s__('ContentEditor|Apply language') }}</gl-button>
      <gl-button v-if="session" size="small" @click="cancel">{{ s__('ContentEditor|Cancel language edit') }}</gl-button>
      <gl-button size="small" :disabled="!menuContext" @click="copy">{{ s__('ContentEditor|Copy code') }}</gl-button>
      <gl-button size="small" variant="danger" category="secondary" :disabled="disabled || conflict" @click="remove">{{ s__('ContentEditor|Delete code block') }}</gl-button>
      <gl-button v-if="isFrontmatter" size="small" :disabled="disabled || conflict" @click="convertToCode">{{ s__('ContentEditor|Convert to regular code block') }}</gl-button>
    </gl-form>
    <p v-if="copyState === 'copied'" role="status" class="gl-mb-0 gl-mt-3">{{ s__('ContentEditor|Code copied.') }}</p>
    <p v-if="copyState === 'failed'" role="alert" class="gl-mb-0 gl-mt-3">{{ s__('ContentEditor|The code could not be copied. Select it in the editor and use your browser copy command.') }}</p>
    <gl-button v-if="isDiagram" class="gl-mt-3" size="small" :aria-expanded="showPreview ? 'true' : 'false'" @click="showPreview = !showPreview">
      {{ showPreview ? s__('ContentEditor|Hide diagram preview') : s__('ContentEditor|Show diagram preview') }}
    </gl-button>
    <gl-button v-if="isDiagram" class="gl-mt-3" size="small" @click="openSource">
      {{ disabled ? s__('ContentEditor|View diagram source') : s__('ContentEditor|Edit diagram source') }}
    </gl-button>
    <gl-button v-if="isFrontmatter" class="gl-mt-3" size="small" @click="openSource">{{ disabled ? s__('ContentEditor|View frontmatter source') : s__('ContentEditor|Edit frontmatter source') }}</gl-button>
    <fountain-diagram-preview v-if="isDiagram && showPreview" :content-editor="contentEditor" :source="menuContext.text" :language="menuContext.language" />
    <gl-modal v-model="dialogOpen" :modal-id="modalId" size="lg" :title="sourceTitle" :action-primary="sourceAction" :action-cancel="sourceCancel" :return-focus="focusTarget" no-focus-on-show @shown="focusSourceOnShow" :no-close-on-esc="sourceComposing" :no-close-on-backdrop="hasUnappliedSource" @primary="applySource" @hide="hideSource" @hidden="hiddenSource">
      <template v-if="dialogOpen && dialogContext">
        <template v-if="sourceIsSuggestion">
          <p>{{ s__('ContentEditor|Edit the proposed replacement here or directly in the document. Applying changes the comment; GitLab applies it to the repository separately.') }}</p>
          <div v-if="sourceRangeEnabled" class="gl-flex gl-flex-wrap gl-items-end gl-gap-3 gl-mb-4">
            <gl-form-group :label="s__('ContentEditor|First file line')" :label-for="`${modalId}-start`" class="gl-mb-0"><gl-form-input :id="`${modalId}-start`" v-model="rangeStart" type="number" min="1" :disabled="disabled || sourceConflict || sourceApplying || rangeLoading" /></gl-form-group>
            <gl-form-group :label="s__('ContentEditor|Last file line')" :label-for="`${modalId}-end`" class="gl-mb-0"><gl-form-input :id="`${modalId}-end`" v-model="rangeEnd" type="number" min="1" :disabled="disabled || sourceConflict || sourceApplying || rangeLoading" /></gl-form-group>
            <gl-button size="small" :disabled="sourceConflict || sourceApplying || rangeLoading" :loading="rangeLoading" @click="loadOriginalFile">{{ s__('ContentEditor|Load original file') }}</gl-button>
          </div>
          <p v-else>{{ s__('ContentEditor|File range controls are available when this editor has a current diff-line context.') }}</p>
          <pre v-if="fileLines" role="region" class="gl-max-h-48 gl-overflow-auto" :aria-label="s__('ContentEditor|Original file lines')">{{ rangePreview }}</pre>
          <gl-alert v-if="sourceDeletesLines" variant="warning" :dismissible="false" class="gl-mt-3">
            {{ sourceWhitespaceDeletion ? s__('ContentEditor|GitLab applies a whitespace-only suggestion as a deletion, not as blank lines. Your exact source is retained. Continuing proposes deleting the target file lines.') : s__('ContentEditor|An empty replacement proposes deleting the target file lines. GitLab applies the deletion only after you save this comment and choose Apply suggestion.') }}
          </gl-alert>
          <gl-form-checkbox v-if="sourceWhitespaceDeletion && !disabled" v-model="sourceDeletionConfirmed" class="gl-mt-3">{{ s__('ContentEditor|I intend to delete these file lines') }}</gl-form-checkbox>
        </template>
        <p v-else-if="sourceIsFrontmatter">{{ disabled ? s__('ContentEditor|Read-only frontmatter source. The source is preserved literally and is not evaluated or checked as YAML, TOML or JSON.') : s__('ContentEditor|Edit the source contents without the opening and closing delimiters. Apply makes one undoable change. The source is preserved literally and is not evaluated or checked as YAML, TOML or JSON.') }}</p>
        <p v-else>{{ disabled ? s__('ContentEditor|Read-only source. Previewing does not change the document.') : s__('ContentEditor|Preview your draft here. Apply updates the selected diagram in one undoable change; Cancel leaves the document unchanged.') }}</p>
        <gl-alert v-if="sourceMessage" variant="danger" :dismissible="false">{{ sourceMessage }}</gl-alert>
        <div :class="{ 'fountain-diagram-authoring': !sourceIsFrontmatter && !sourceIsSuggestion }">
          <gl-form-group :label="sourceLabel" :label-for="`${modalId}-source`">
            <gl-form-textarea ref="sourceField" :id="`${modalId}-source`" v-model="sourceDraft" :readonly="disabled" :rows="14" wrap="off" spellcheck="false" class="fountain-diagram-source" @input="sourceCopyState = null" @compositionstart="sourceComposing = true" @compositionend="sourceComposing = false" @keydown="onSourceKeydown" />
          </gl-form-group>
          <div v-if="!sourceIsFrontmatter && !sourceIsSuggestion" class="fountain-diagram-draft-preview">
            <h3 class="gl-heading-4">{{ s__('ContentEditor|Draft preview') }}</h3>
            <fountain-diagram-preview :content-editor="contentEditor" :source="sourceDraft" :language="dialogContext.language" />
          </div>
        </div>
        <gl-button size="small" @click="copySource">{{ s__('ContentEditor|Copy source draft') }}</gl-button>
        <p v-if="sourceCopyState === 'copied'" role="status">{{ s__('ContentEditor|Source draft copied.') }}</p>
        <p v-if="sourceCopyState === 'failed'" role="alert">{{ s__('ContentEditor|Copy failed. Select the source and use your browser copy command.') }}</p>
      </template>
    </gl-modal>
  </section>
  </fountain-context-surface>
</template>
<style scoped>
.fountain-diagram-authoring { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; }
.fountain-diagram-source { font-family: monospace; min-height: 20rem; max-height: 55vh; }
.fountain-diagram-draft-preview { min-width: 0; overflow: auto; }
@media (max-width: 767px) { .fountain-diagram-authoring { grid-template-columns: minmax(0, 1fr); } }
</style>
