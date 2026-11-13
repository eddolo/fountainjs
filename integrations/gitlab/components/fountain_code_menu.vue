<script>
import { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlFormTextarea, GlModal } from '@gitlab/ui';
import { markRaw } from 'vue';
import { uniqueId } from 'lodash-es';
import { s__ } from '~/locale';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import CODE_BLOCK_LANGUAGES from '../constants/code_block_languages';
import { getGitLabCodeContext } from '../runtime/browser';
import FountainDiagramPreview from './fountain_diagram_preview.vue';
import FountainContextSurface from './fountain_context_surface.vue';

export default {
  name: 'FountainCodeMenu',
  components: { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlFormTextarea, GlModal, FountainDiagramPreview, FountainContextSurface },
  props: {
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
    getEditorRoot: { type: Function, required: false, default: null },
  },
  emits: ['focus', 'error'],
  data() {
    return { context: null, session: null, language: '', errorCode: null, copyState: null, showPreview: false,
      inputId: uniqueId('fountain-code-language-'), revision: 0,
      dialogOpen: false, dialogContext: null, sourceSession: null, sourceDraft: '', sourceError: null,
      sourceCopyState: null, sourceComposing: false, modalId: uniqueId('fountain-diagram-source-') };
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
    sourceIsFrontmatter() { return Boolean(this.dialogContext?.frontmatter); },
    sourceTitle() { return this.sourceIsFrontmatter ? s__('ContentEditor|Frontmatter source') : s__('ContentEditor|Diagram source and preview'); },
    sourceLabel() { return this.sourceIsFrontmatter ? s__('ContentEditor|Frontmatter source') : s__('ContentEditor|Diagram source'); },
    // The host reads this before saving or switching editing mode.
    hasUnappliedSource() { return this.dialogOpen && this.sourceDraft !== this.dialogContext?.text; },
    sourceConflict() { return this.revision >= 0 && Boolean(this.sourceSession?.conflict || this.sourceSession?.closed); },
    sourceAction() {
      if (this.disabled) return null;
      return { text: this.sourceIsFrontmatter ? s__('ContentEditor|Apply frontmatter source') : s__('ContentEditor|Apply diagram source'), attributes: { variant: 'confirm',
        disabled: !this.sourceSession || this.sourceConflict || this.sourceComposing } };
    },
    sourceCancel() {
      if (!this.disabled) return { text: s__('ContentEditor|Cancel source edit') };
      return { text: this.sourceIsFrontmatter ? s__('ContentEditor|Close frontmatter source') : s__('ContentEditor|Close diagram source') };
    },
    focusTarget() { return { focus: () => { if (!this.disposed) this.$emit('focus'); } }; },
    sourceMessage() {
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
      if ((!this.isDiagram && !this.isFrontmatter) || this.dialogOpen) return;
      if (this.session && this.language !== this.session.initial.language) {
        this.errorCode = 'GITLAB_CODE_LANGUAGE_DRAFT_PENDING'; return;
      }
      try {
        const context = this.menuContext;
        this.sourceSession = this.disabled ? null : this.session || markRaw(this.contentEditor.beginCodeEdit());
        if (this.disabled) this.session?.close();
        this.session = null;
        this.dialogContext = this.sourceSession?.initial || context;
        this.sourceDraft = this.dialogContext.text; this.sourceError = null; this.sourceCopyState = null;
        this.sourceComposing = false; this.showPreview = false; this.errorCode = null; this.dialogOpen = true;
      } catch (error) { this.errorCode = error.message; }
    },
    applySource(event) {
      event?.preventDefault();
      if (this.disabled || this.sourceConflict || this.sourceComposing || !this.sourceSession) return;
      try {
        this.sourceSession.applySource(this.sourceDraft);
        this.dialogOpen = false; this.sourceSession = null; this.sourceError = null; this.refresh();
      } catch (error) { this.sourceError = error.message; }
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
  <fountain-context-surface v-if="visible" ref="contextSurface" :editor="contentEditor.editor" :active="visible" :anchor-path="menuAnchorPath" :get-editor-root="getEditorRoot" :label="s__('ContentEditor|Code block actions')" :suspended="dialogOpen" @reveal="$emit('focus')">
  <section data-testid="native-code-menu" class="gl-w-full" :aria-label="s__('ContentEditor|Code block controls')" @keydown="onKeydown">
    <gl-alert v-if="formError" variant="danger" :dismissible="false" class="gl-mb-3">{{ formError }}</gl-alert>
    <p v-if="isFrontmatter" class="gl-mb-3">{{ menuContext.frontmatter === 'header' ? s__('ContentEditor|Document frontmatter stays at the beginning. Edit its literal source here or in the editor. Changing the format preserves the source; it does not translate YAML, TOML or JSON.') : s__('ContentEditor|This is a code fence labelled frontmatter, not a document header. Its fence parameter is preserved when you save.') }}</p>
    <gl-form class="gl-flex gl-flex-wrap gl-items-end gl-gap-3" @submit.stop.prevent="apply">
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
    <gl-modal v-model="dialogOpen" :modal-id="modalId" size="lg" :title="sourceTitle" :action-primary="sourceAction" :action-cancel="sourceCancel" :return-focus="focusTarget" :no-close-on-esc="sourceComposing" :no-close-on-backdrop="hasUnappliedSource" @primary="applySource" @hide="hideSource" @hidden="hiddenSource">
      <template v-if="dialogOpen && dialogContext">
        <p v-if="sourceIsFrontmatter">{{ disabled ? s__('ContentEditor|Read-only frontmatter source. The source is preserved literally and is not evaluated or checked as YAML, TOML or JSON.') : s__('ContentEditor|Edit the source contents without the opening and closing delimiters. Apply makes one undoable change. The source is preserved literally and is not evaluated or checked as YAML, TOML or JSON.') }}</p>
        <p v-else>{{ disabled ? s__('ContentEditor|Read-only source. Previewing does not change the document.') : s__('ContentEditor|Preview your draft here. Apply updates the selected diagram in one undoable change; Cancel leaves the document unchanged.') }}</p>
        <gl-alert v-if="sourceMessage" variant="danger" :dismissible="false">{{ sourceMessage }}</gl-alert>
        <div :class="{ 'fountain-diagram-authoring': !sourceIsFrontmatter }">
          <gl-form-group :label="sourceLabel" :label-for="`${modalId}-source`">
            <gl-form-textarea :id="`${modalId}-source`" v-model="sourceDraft" :readonly="disabled" :rows="14" wrap="off" spellcheck="false" class="fountain-diagram-source" @input="sourceCopyState = null" @compositionstart="sourceComposing = true" @compositionend="sourceComposing = false" @keydown="onSourceKeydown" />
          </gl-form-group>
          <div v-if="!sourceIsFrontmatter" class="fountain-diagram-draft-preview">
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
