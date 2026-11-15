<script>
import { GlAlert, GlButton, GlForm, GlFormGroup, GlFormSelect, GlFormTextarea, GlModal } from '@gitlab/ui';
import { markRaw } from 'vue';
import { uniqueId } from 'lodash-es';
import { s__, n__, sprintf } from '~/locale';
import FountainContextSurface from './fountain_context_surface.vue';
import {
  toggleMark,
  isMarkActive,
  setBlockType,
  toggleQuote,
  toggleList,
  undo,
  redo,
  canUndo,
  canRedo,
  getGitLabAlertContext,
  getGitLabCodeContext,
  selectionIncludesGitLabFrontmatter,
  getGitLabFootnoteContext,
  selectFootnoteDefinition,
  deleteGitLabFootnote,
  deleteGitLabFootnoteReference,
} from '../runtime/browser';

export default {
  name: 'FountainFormattingToolbar',
  components: { GlAlert, GlButton, GlForm, GlFormGroup, GlFormSelect, GlFormTextarea, GlModal, FountainContextSurface },
  props: {
    editor: { type: Object, required: true },
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
    hideAttachmentButton: { type: Boolean, required: false, default: false },
    getEditorRoot: { type: Function, required: false, default: null },
  },
  emits: ['focus', 'error', 'paste-markdown', 'attach-files'],
  data() {
    return { state: null, footnoteOpen: false, footnoteText: '', footnoteExisting: '', footnoteApplying: false, footnoteFailed: false,
      footnoteModalId: uniqueId('fountain-footnote-') };
  },
  computed: {
    footnoteContext() { return this.state && getGitLabFootnoteContext(this.editor); },
    footnoteChoices() {
      const items = [{ value: '', text: s__('ContentEditor|New footnote') }];
      this.state?.doc.descendants(node => {
        if (node.type.name === 'footnote_definition') items.push({ value: node.attrs.id,
          text: `${node.attrs.gitlabFootnoteLabel || node.attrs.id}: ${node.textContent.replace(/\s+/gu, ' ').slice(0, 80)}` });
      });
      return items;
    },
    footnoteDescription() {
      const count = this.footnoteContext?.references || 0;
      return count ? sprintf(n__('ContentEditor|Used by %{count} reference.', 'ContentEditor|Used by %{count} references.', count), { count })
        : s__('ContentEditor|This definition is retained without a reference.');
    },
    footnotePrimary() { return { text: this.footnoteExisting ? s__('ContentEditor|Insert reference') : s__('ContentEditor|Insert footnote'), attributes: { variant: 'confirm',
      disabled: this.disabled || !this.footnoteExisting && !this.footnoteText.trim() || this.footnoteApplying || this.footnoteFailed, loading: this.footnoteApplying } }; },
    footnoteCancel() { return { text: s__('ContentEditor|Cancel') }; },
    footnoteReturnFocus() { return { focus: () => this.$emit('focus') }; },
    plainTitle() {
      return Boolean(this.state && getGitLabAlertContext(this.editor)?.inTitle);
    },
    codeContext() { return this.state && getGitLabCodeContext(this.editor); },
    headerSelected() {
      return Boolean(this.state && selectionIncludesGitLabFrontmatter(this.editor));
    },
    controls() {
      if (!this.state) return [];
      return [
        {
          key: 'undo',
          label: s__('ContentEditor|Undo'),
          icon: 'go-back',
          disabled: !canUndo(this.editor),
          run: () => undo(this.editor),
        },
        {
          key: 'redo',
          label: s__('ContentEditor|Redo'),
          icon: 'redo',
          disabled: !canRedo(this.editor),
          run: () => redo(this.editor),
        },
        ...[
          ['bold', 'strong', s__('ContentEditor|Bold'), 'bold'],
          ['italic', 'em', s__('ContentEditor|Italic'), 'italic'],
          ['strike', 'strike', s__('ContentEditor|Strikethrough'), 'strikethrough'],
          ['code', 'code', s__('ContentEditor|Inline code'), 'code'],
        ].map(([key, mark, label, icon]) => ({
          key,
          label,
          icon,
          active: isMarkActive(this.editor, mark),
          disabled: this.plainTitle || Boolean(this.codeContext) || this.headerSelected,
          run: () => toggleMark(this.editor, mark),
        })),
        {
          key: 'blockquote',
          label: s__('ContentEditor|Insert a quote'),
          icon: 'quote',
          disabled: this.plainTitle || this.headerSelected,
          run: () => toggleQuote(this.editor),
        },
        ...[
          ['bullet', s__('ContentEditor|Bullet list'), 'list-bulleted'],
          ['ordered', s__('ContentEditor|Numbered list'), 'list-numbered'],
          ['task', s__('ContentEditor|Checklist'), 'list-task'],
        ].map(([kind, label, icon]) => ({
          key: kind,
          label,
          icon,
          disabled: this.plainTitle || this.headerSelected,
          run: () => toggleList(this.editor, kind),
        })),
        { key: 'frontmatter', label: s__('ContentEditor|Insert frontmatter'), icon: 'code',
          disabled: this.state.doc.content.some(node => node.attrs.gitlabFrontmatter?.kind === 'header'),
          run: () => this.contentEditor.insertFrontmatter() },
        { key: 'footnote', label: s__('ContentEditor|Insert footnote'), icon: 'superscript',
          disabled: this.plainTitle || this.headerSelected || Boolean(this.codeContext) || this.state.selection.kind !== 'text' || !this.state.selection.isSingleText,
          run: () => this.openFootnote() },
        ...(this.contentEditor.quickActions?.enabled ? [{ key: 'quick-action', label: s__('ContentEditor|Add a quick action'),
          icon: 'quick-actions', run: () => this.contentEditor.quickActions.insert() }] : []),
      ];
    },
    styles() {
      return [
        { value: 'paragraph', text: s__('ContentEditor|Normal text') },
        { value: '1', text: s__('ContentEditor|Heading 1') },
        { value: '2', text: s__('ContentEditor|Heading 2') },
        { value: '3', text: s__('ContentEditor|Heading 3') },
        { value: 'code', text: s__('ContentEditor|Code block') },
        { value: 'mermaid', text: s__('ContentEditor|Mermaid diagram') },
        { value: 'plantuml', text: s__('ContentEditor|PlantUML diagram') },
        ...(this.codeContext?.frontmatter === 'header' ? [{ value: 'frontmatter', text: s__('ContentEditor|Document frontmatter'), disabled: true }] : []),
      ];
    },
    activeStyle() {
      if (!this.state) return 'paragraph';
      let node = this.state.doc;
      for (const index of this.state.selection.path) {
        if (!node.content[index]) break;
        node = node.child(index);
        if (node.type.name === 'heading') return String(node.attrs.level);
        if (node.type.name === 'code_block') {
          if (node.attrs.gitlabFrontmatter?.kind === 'header') return 'frontmatter';
          return ['mermaid', 'plantuml'].includes(node.attrs.language) ? node.attrs.language : 'code';
        }
      }
      return 'paragraph';
    },
  },
  created() {
    this.disposed = false;
    this.state = markRaw(this.editor.state);
    this.releaseState = this.editor.subscribe((state) => {
      this.state = markRaw(state);
    });
  },
  beforeDestroy() {
    this.disposed = true;
    this.footnoteSession?.cancel();
    this.releaseState();
  },
  methods: {
    openFootnote() {
      this.footnoteSession?.cancel();
      this.footnoteSession = markRaw(this.contentEditor.beginFootnoteInsertion());
      this.footnoteFailed = false; this.footnoteExisting = ''; this.footnoteOpen = true; return true;
    },
    async applyFootnote(event) {
      event?.preventDefault();
      if (this.disabled || this.footnoteApplying || this.footnoteFailed || !this.footnoteExisting && !this.footnoteText.trim()) return;
      this.footnoteApplying = true;
      try {
        const result = await (this.footnoteExisting ? this.footnoteSession.applyExisting(this.footnoteExisting) : this.footnoteSession.apply(this.footnoteText));
        if (this.disposed) return;
        if (result.status !== 'applied') throw new Error('GITLAB_FOOTNOTE_INSERTION_CANCELLED');
        this.footnoteText = ''; this.footnoteOpen = false;
      } catch { if (!this.disposed && this.footnoteOpen) this.footnoteFailed = true; }
      finally { if (!this.disposed) this.footnoteApplying = false; }
    },
    cancelFootnote(event) { if (!event?.defaultPrevented) this.footnoteSession?.cancel(); },
    footnoteAction(action) {
      const context = this.footnoteContext;
      if (this.disabled || !context) return;
      try {
        const accepted = this.editor.runCommandBatch(() => {
          let result;
          if (action === 'edit') result = selectFootnoteDefinition(this.editor, context.id);
          else if (action === 'reference' && context.referencePath) result = deleteGitLabFootnoteReference(this.editor, context.referencePath, context.id);
          else if (action === 'note') result = deleteGitLabFootnote(this.editor, context.id);
          if (!result) return false;
          this.contentEditor.getSerializedContent(); return true;
        });
        if (!accepted) throw new Error('GITLAB_FOOTNOTE_ACTION_REFUSED');
        this.$emit('focus');
      } catch (error) { this.$emit('error', error); }
    },
    openAttachments() {
      if (!this.disabled && this.editor.editable) this.$refs.attachments.click();
    },
    attachFiles(event) {
      const input = event.target;
      const files = Array.from(input.files);
      input.value = '';
      if (!this.disabled && this.editor.editable && files.length) this.$emit('attach-files', files);
    },
    async pasteMarkdown() {
      if (this.disabled || !this.editor.editable) return;
      try {
        // eslint-disable-next-line no-restricted-properties -- This reads the clipboard; copyToClipboard only writes it.
        const { clipboard } = navigator;
        if (!clipboard?.readText) throw new Error('GITLAB_CLIPBOARD_UNAVAILABLE');
        const markdown = await clipboard.readText();
        this.$emit('paste-markdown', markdown);
      } catch {
        this.$emit('error', new Error('GITLAB_CLIPBOARD_READ_FAILED'));
      }
    },
    preserveSelection(event) {
      if (event.target.closest('button')) event.preventDefault();
    },
    execute(control) {
      if (this.disabled || control.disabled || !this.editor.editable) return;
      try {
        if (!control.run()) throw new Error('GITLAB_NATIVE_COMMAND_REFUSED');
        this.$emit('focus');
      } catch (error) {
        this.$emit('error', error);
      }
    },
    changeStyle(value) {
      if (this.plainTitle || value === 'frontmatter') return;
      const code = getGitLabCodeContext(this.editor);
      if (['code', 'mermaid', 'plantuml'].includes(value)) {
        let language = value;
        if (value === 'code') language = code && !['mermaid', 'plantuml'].includes(code.language) ? code.language : 'text';
        this.execute({ run: () => this.contentEditor.setCodeBlock(language) });
        return;
      }
      let type = 'heading';
      let attrs = {};
      if (value === 'paragraph') type = 'paragraph';
      if (/^\d$/u.test(value)) attrs = { level: Number(value) };
      this.execute({
        run: () => setBlockType(this.editor, type, attrs),
      });
    },
  },
};
</script>
<template>
  <div
    class="gl-border-b gl-flex gl-flex-wrap gl-items-center gl-gap-1 gl-p-3"
    data-testid="formatting-toolbar"
    role="toolbar"
    :aria-label="s__('ContentEditor|Editor toolbar')"
    @mousedown="preserveSelection"
  >
    <gl-form-select
      :value="activeStyle"
      :options="styles"
      :disabled="disabled || plainTitle"
      :aria-label="s__('ContentEditor|Text style')"
      class="gl-w-auto"
      @change="changeStyle"
    />
    <gl-button
      v-for="control in controls"
      :key="control.key"
      :data-testid="control.key"
      :disabled="disabled || control.disabled"
      :selected="Boolean(control.active)"
      :aria-pressed="Boolean(control.active)"
      :aria-label="control.label"
      :title="control.label"
      :icon="control.icon"
      category="tertiary"
      size="small"
      @click="execute(control)"
    />
    <div class="gl-inline-flex gl-shrink-0 gl-items-center gl-gap-1 gl-border-l gl-pl-2" role="group" :aria-label="s__('ContentEditor|Clipboard and files')">
    <template v-if="!hideAttachmentButton">
      <gl-button
        :disabled="disabled"
        :aria-label="s__('ContentEditor|Attach a file or image')"
        :title="s__('ContentEditor|Attach a file or image')"
        icon="paperclip"
        category="tertiary"
        size="small"
        @click="openAttachments"
      />
      <input
        ref="attachments"
        type="file"
        multiple
        class="gl-hidden"
        :aria-label="s__('ContentEditor|Attach a file or image')"
        data-testid="file-upload-field"
        :disabled="disabled"
        @change="attachFiles"
      />
    </template>
    <gl-button :disabled="disabled" category="tertiary" size="small" icon="markdown-mark" :aria-label="s__('ContentEditor|Paste Markdown')" :title="s__('ContentEditor|Paste Markdown')" @click="pasteMarkdown" />
    </div>
    <fountain-context-surface v-if="footnoteContext" :editor="editor" :active="true" :anchor-path="footnoteContext.path" :get-editor-root="getEditorRoot" :label="s__('ContentEditor|Footnote actions')" @reveal="$emit('focus')">
      <div role="group" :aria-label="s__('ContentEditor|Footnote controls')">
        <h2 class="gl-heading-5 gl-mb-2 gl-break-words">{{ s__('ContentEditor|Footnote') }} {{ footnoteContext.label }}</h2>
        <p class="gl-text-subtle">{{ footnoteDescription }}</p>
        <gl-button :disabled="disabled" variant="confirm" category="primary" icon="pencil" @click="footnoteAction('edit')">{{ s__('ContentEditor|Edit note text') }}</gl-button>
        <gl-button v-if="footnoteContext.referencePath" :disabled="disabled" category="tertiary" @click="footnoteAction('reference')">{{ s__('ContentEditor|Remove this reference') }}</gl-button>
        <div class="gl-mt-4 gl-border-t gl-pt-3"><gl-button :disabled="disabled" category="tertiary" variant="danger" icon="remove" @click="footnoteAction('note')">{{ s__('ContentEditor|Delete note and references') }}</gl-button></div>
      </div>
    </fountain-context-surface>
    <gl-modal v-model="footnoteOpen" :modal-id="footnoteModalId" :title="s__('ContentEditor|Insert footnote')" :action-primary="footnotePrimary" :action-cancel="footnoteCancel" :return-focus="footnoteReturnFocus" @primary="applyFootnote" @hide="cancelFootnote">
      <gl-alert v-if="footnoteFailed" variant="danger" :dismissible="false">{{ s__('ContentEditor|The footnote could not be inserted. Your draft is retained. Cancel and reopen to retry at the selected position.') }}</gl-alert>
      <gl-form @submit.stop.prevent="applyFootnote">
        <gl-form-group v-if="footnoteChoices.length > 1" :label="s__('ContentEditor|Footnote to insert')" :label-for="`${footnoteModalId}-existing`"><gl-form-select :id="`${footnoteModalId}-existing`" v-model="footnoteExisting" :options="footnoteChoices" :disabled="footnoteApplying" /></gl-form-group>
        <gl-form-group v-if="!footnoteExisting" :label="s__('ContentEditor|Footnote text (Markdown)')" :label-for="`${footnoteModalId}-text`">
          <gl-form-textarea :id="`${footnoteModalId}-text`" v-model="footnoteText" :rows="4" :disabled="footnoteApplying" required autofocus />
        </gl-form-group>
      </gl-form>
    </gl-modal>
    <slot name="context-actions"></slot>
    <slot name="header-buttons"></slot>
  </div>
</template>
