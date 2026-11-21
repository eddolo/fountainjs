<script>
import { GlAlert, GlButton, GlDisclosureDropdown, GlForm, GlFormGroup, GlFormInput, GlFormSelect, GlFormTextarea, GlModal } from '@gitlab/ui';
import { markRaw } from 'vue';
import { uniqueId } from 'lodash-es';
import { s__, n__, sprintf } from '~/locale';
import ToolbarTableButton from '~/content_editor/components/toolbar_table_button.vue';
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
  insertGitLabContents, insertTable, getActiveTableCell, addTableRow, addTableColumn, deleteTableRow,
  deleteTableColumn, deleteTable, mergeTableCells, splitTableCell, convertGitLabTableCheckboxes, hasGitLabTableCheckboxes,
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
  components: { GlAlert, GlButton, GlDisclosureDropdown, GlForm, GlFormGroup, GlFormInput, GlFormSelect, GlFormTextarea, GlModal, FountainContextSurface, ToolbarTableButton },
  props: {
    editor: { type: Object, required: true },
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
    supportsTableOfContents: { type: Boolean, default: false },
    hideAttachmentButton: { type: Boolean, required: false, default: false },
    getEditorRoot: { type: Function, required: false, default: null },
  },
  emits: ['focus', 'error', 'paste-markdown', 'attach-files'],
  data() {
    return { state: null, footnoteOpen: false, footnoteText: '', footnoteExisting: '', footnoteApplying: false, footnoteFailed: false,
      footnoteModalId: uniqueId('fountain-footnote-'), renameOpen: false, renameLabel: '', renameState: null,
      renameError: null, renameApplying: false, renameModalId: uniqueId('fountain-note-label-') };
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
    renamePrimary() { return { text: s__('ContentEditor|Rename footnote'), attributes: { variant: 'confirm',
      disabled: this.disabled || !this.renameLabel || this.renameApplying || this.renameState?.conflict || this.renameState?.closed,
      loading: this.renameApplying } }; },
    renameMessage() {
      if (this.renameState?.conflict || this.renameError === 'GITLAB_FOOTNOTE_TARGET_CHANGED')
        return s__('ContentEditor|The selected note changed. Your draft is retained. Cancel and reopen to review the current note.');
      if (this.renameError === 'GITLAB_FOOTNOTE_INVALID_LABEL')
        return s__('ContentEditor|Use a nonempty Markdown label without spaces or square brackets.');
      if (['GITLAB_FOOTNOTE_LABEL_COLLISION', 'GITLAB_FOOTNOTE_RENAME_RESOLUTION'].includes(this.renameError))
        return s__('ContentEditor|That label would change the document or connect references to another note. Choose another label. Your document is unchanged.');
      if (this.renameError === 'GITLAB_FOOTNOTE_DOCUMENT_CHANGED')
        return s__('ContentEditor|The document changed while the label was being checked. Your draft is retained. Review it and try again.');
      if (this.renameError === 'GITLAB_FOOTNOTE_RENAME_SOURCE')
        return s__('ContentEditor|This document needs source editing before its labels can be safely changed. Your document is unchanged.');
      return this.renameError ? s__('ContentEditor|The label could not be checked. Your draft and document are retained. Check the connection and try again.') : '';
    },
    plainTitle() {
      return Boolean(this.state && getGitLabAlertContext(this.editor)?.inTitle);
    },
    codeContext() { return this.state && getGitLabCodeContext(this.editor); },
    headerSelected() {
      return Boolean(this.state && selectionIncludesGitLabFrontmatter(this.editor));
    },
    activeCell() { return this.state && getActiveTableCell(this.editor); },
    tableActions() {
      if (!this.activeCell) return [];
      const { map, cell } = this.activeCell;
      const multiple = this.state.selection.kind === 'cell' && this.state.selection.cellPaths.length > 1;
      const insert = [
        { text: s__('ContentEditor|Insert row above'), run: () => addTableRow(this.editor, 'before') },
        { text: s__('ContentEditor|Insert row below'), run: () => addTableRow(this.editor, 'after') },
        { text: s__('ContentEditor|Insert column left'), run: () => addTableColumn(this.editor, 'before') },
        { text: s__('ContentEditor|Insert column right'), run: () => addTableColumn(this.editor, 'after') },
      ];
      const cells = [];
      if (multiple) cells.push({ text: s__('ContentEditor|Merge cells'), run: () => mergeTableCells(this.editor) });
      else if (cell.rowspan > 1 || cell.colspan > 1) cells.push({ text: s__('ContentEditor|Split cell'), run: () => splitTableCell(this.editor) });
      if (hasGitLabTableCheckboxes(this.activeCell.table)) {
        cells.push({ text: s__('ContentEditor|Convert table checkboxes to checklist items'), run: () => convertGitLabTableCheckboxes(this.editor) });
      }
      const remove = [];
      if (!multiple && map.height > 1) remove.push({ text: s__('ContentEditor|Delete row'), run: () => deleteTableRow(this.editor) });
      if (!multiple && map.width > 1) remove.push({ text: s__('ContentEditor|Delete column'), run: () => deleteTableColumn(this.editor) });
      remove.push({ text: s__('ContentEditor|Delete table'), run: () => deleteTable(this.editor) });
      return [multiple ? [] : insert, cells, remove].filter(items => items.length).map(items => ({ items }));
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
    controlGroups() {
      return [
        { label: s__('ContentEditor|History'), keys: ['undo', 'redo'] },
        { label: s__('ContentEditor|Text formatting'), keys: ['bold', 'italic', 'strike', 'code'] },
        { label: s__('ContentEditor|Lists and quotes'), keys: ['blockquote', 'bullet', 'ordered', 'task'] },
        { label: s__('ContentEditor|Document tools'), keys: ['frontmatter', 'footnote', 'quick-action'] },
      ].map(group => ({ ...group, controls: this.controls.filter(control => group.keys.includes(control.key)) }));
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
    this.renameSession?.close();
    this.releaseState();
  },
  methods: {
    openRename() {
      if (this.disabled) return;
      try {
        this.renameSession?.close();
        this.renameSession = markRaw(this.contentEditor.beginFootnoteRename(snapshot => { if (!this.disposed) this.renameState = snapshot; }));
        this.renameState = this.renameSession.snapshot; this.renameLabel = this.renameState.label;
        this.renameError = null; this.renameApplying = false; this.renameOpen = true;
      } catch (error) { this.$emit('error', error); }
    },
    async applyRename(event) {
      event?.preventDefault();
      if (this.disabled || this.renameApplying || !this.renameLabel || !this.renameSession || this.renameState?.conflict) return;
      const session = this.renameSession; this.renameApplying = true; this.renameError = null;
      try {
        const result = await session.apply(this.renameLabel);
        if (!this.disposed && this.renameOpen && this.renameSession === session && result.status === 'applied') this.renameOpen = false;
      } catch (error) { if (!this.disposed && this.renameOpen && this.renameSession === session) this.renameError = error.message; }
      finally { if (!this.disposed && this.renameSession === session) this.renameApplying = false; }
    },
    cancelRename(event) { if (!event?.defaultPrevented) this.renameSession?.close(); },
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
    insertContents() {
      this.execute({ run: () => insertGitLabContents(this.editor) });
    },
    insertTableAtSelection({ rows, cols }) {
      this.execute({ run: () => insertTable(this.editor, { rows, columns: cols, headerRow: true }) });
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
    <div v-for="group in controlGroups" :key="group.label" class="fountain-tool-group gl-inline-flex gl-flex-wrap gl-shrink-0 gl-items-center gl-gap-1 gl-border-l gl-pl-2 gl-max-w-full" role="group" :aria-label="group.label">
      <gl-button
      v-for="control in group.controls"
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
      <template v-if="group.keys.includes('footnote') && !disabled && !plainTitle && !codeContext && !headerSelected">
        <gl-disclosure-dropdown v-if="activeCell" size="small" category="tertiary" icon="table"
          :toggle-text="s__('ContentEditor|Table actions')" :items="tableActions" @action="execute" />
        <toolbar-table-button v-else @insert-table="insertTableAtSelection" />
        <gl-button v-if="supportsTableOfContents && !activeCell" size="small" category="tertiary" icon="book"
          :aria-label="s__('ContentEditor|Table of contents')" :title="s__('ContentEditor|Table of contents')" @click="insertContents" />
      </template>
      <fountain-context-surface v-if="group.keys.includes('footnote') && footnoteContext" :editor="editor" :active="true" :anchor-path="footnoteContext.path" :get-editor-root="getEditorRoot" :label="s__('ContentEditor|Footnote actions')" :trigger-text="s__('ContentEditor|Note')" :suspended="renameOpen || footnoteOpen" @reveal="$emit('focus')">
        <div class="gl-w-full" role="group" :aria-label="s__('ContentEditor|Footnote controls')">
          <h2 class="gl-heading-5 gl-mb-2 gl-break-words">{{ s__('ContentEditor|Footnote') }} {{ footnoteContext.label }}</h2>
          <p class="gl-text-subtle">{{ footnoteDescription }}</p>
          <div class="gl-flex gl-flex-col gl-items-stretch gl-gap-2">
            <gl-button :disabled="disabled" variant="confirm" category="primary" icon="pencil" @click="footnoteAction('edit')">{{ s__('ContentEditor|Edit note text') }}</gl-button>
            <gl-button :disabled="disabled" category="tertiary" class="gl-justify-start" button-text-classes="gl-w-full gl-text-left" @click="openRename">{{ s__('ContentEditor|Rename label') }}</gl-button>
          </div>
          <div class="gl-mt-4 gl-border-t gl-pt-3 gl-flex gl-flex-col gl-items-stretch gl-gap-2">
            <gl-button v-if="footnoteContext.referencePath" :disabled="disabled" category="tertiary" variant="danger" class="gl-justify-start" button-text-classes="gl-w-full gl-text-left" @click="footnoteAction('reference')">{{ s__('ContentEditor|Remove this reference') }}</gl-button>
            <gl-button :disabled="disabled" category="tertiary" variant="danger" icon="remove" class="gl-justify-start" button-text-classes="gl-w-full gl-text-left" @click="footnoteAction('note')">{{ s__('ContentEditor|Delete note and references') }}</gl-button>
          </div>
        </div>
      </fountain-context-surface>
    </div>
    <slot name="context-actions"></slot>
    <div class="fountain-clipboard-tools gl-inline-flex gl-flex-wrap gl-shrink-0 gl-items-center gl-gap-1 gl-border-l gl-pl-2 gl-max-w-full" role="group" :aria-label="s__('ContentEditor|Clipboard, files and media')">
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
    <slot name="clipboard-actions"></slot>
    </div>
    <gl-modal v-model="footnoteOpen" :modal-id="footnoteModalId" :title="s__('ContentEditor|Insert footnote')" :action-primary="footnotePrimary" :action-cancel="footnoteCancel" :return-focus="footnoteReturnFocus" @primary="applyFootnote" @hide="cancelFootnote">
      <gl-alert v-if="footnoteFailed" variant="danger" :dismissible="false">{{ s__('ContentEditor|The footnote could not be inserted. Your draft is retained. Cancel and reopen to retry at the selected position.') }}</gl-alert>
      <gl-form @submit.stop.prevent="applyFootnote">
        <gl-form-group v-if="footnoteChoices.length > 1" :label="s__('ContentEditor|Footnote to insert')" :label-for="`${footnoteModalId}-existing`"><gl-form-select :id="`${footnoteModalId}-existing`" v-model="footnoteExisting" :options="footnoteChoices" :disabled="footnoteApplying" /></gl-form-group>
        <gl-form-group v-if="!footnoteExisting" :label="s__('ContentEditor|Footnote text (Markdown)')" :label-for="`${footnoteModalId}-text`">
          <gl-form-textarea :id="`${footnoteModalId}-text`" v-model="footnoteText" :rows="4" :disabled="footnoteApplying" required autofocus />
        </gl-form-group>
      </gl-form>
    </gl-modal>
    <gl-modal v-model="renameOpen" :modal-id="renameModalId" :title="s__('ContentEditor|Rename footnote label')" :action-primary="renamePrimary" :action-cancel="footnoteCancel" :return-focus="footnoteReturnFocus" @primary="applyRename" @hide="cancelRename">
      <gl-alert v-if="renameMessage" variant="danger" :dismissible="false" class="gl-mb-3">{{ renameMessage }}</gl-alert>
      <gl-form @submit.stop.prevent="applyRename">
        <button type="submit" class="gl-hidden"></button>
        <gl-form-group :label="s__('ContentEditor|Footnote label')" :label-for="`${renameModalId}-label`" :description="s__('ContentEditor|Used in Markdown references. Display numbers follow document order automatically.')">
          <gl-form-input :id="`${renameModalId}-label`" v-model="renameLabel" :maxlength="4096" :disabled="renameApplying" required autofocus />
        </gl-form-group>
      </gl-form>
    </gl-modal>
    <slot name="header-buttons"></slot>
  </div>
</template>

<style scoped>
/* Keep contextual triggers with their tools; let mobile panels use a full row. */
.fountain-clipboard-tools:has([data-menu-mode='docked']),
.fountain-tool-group:has([data-menu-mode='docked']) {
  width: 100%;
  border: 0;
  padding: 0;
}
</style>
