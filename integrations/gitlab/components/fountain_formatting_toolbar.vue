<script>
import { GlButton, GlFormSelect } from '@gitlab/ui';
import { markRaw } from 'vue';
import { s__ } from '~/locale';
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
} from '../runtime/browser';

export default {
  name: 'FountainFormattingToolbar',
  components: { GlButton, GlFormSelect },
  props: {
    editor: { type: Object, required: true },
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
    hideAttachmentButton: { type: Boolean, required: false, default: false },
  },
  emits: ['focus', 'error', 'paste-markdown', 'attach-files'],
  data() {
    return { state: null };
  },
  computed: {
    plainTitle() {
      return Boolean(this.state && getGitLabAlertContext(this.editor)?.inTitle);
    },
    codeContext() { return this.state && getGitLabCodeContext(this.editor); },
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
          disabled: this.plainTitle || Boolean(this.codeContext),
          run: () => toggleMark(this.editor, mark),
        })),
        {
          key: 'blockquote',
          label: s__('ContentEditor|Insert a quote'),
          icon: 'quote',
          disabled: this.plainTitle,
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
          disabled: this.plainTitle,
          run: () => toggleList(this.editor, kind),
        })),
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
      ];
    },
    activeStyle() {
      if (!this.state) return 'paragraph';
      let node = this.state.doc;
      for (const index of this.state.selection.path) {
        if (!node.content[index]) break;
        node = node.child(index);
        if (node.type.name === 'heading') return String(node.attrs.level);
        if (node.type.name === 'code_block') return ['mermaid', 'plantuml'].includes(node.attrs.language) ? node.attrs.language : 'code';
      }
      return 'paragraph';
    },
  },
  created() {
    this.state = markRaw(this.editor.state);
    this.releaseState = this.editor.subscribe((state) => {
      this.state = markRaw(state);
    });
  },
  beforeDestroy() {
    this.releaseState();
  },
  methods: {
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
      if (this.plainTitle) return;
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
    class="gl-border-b gl-flex gl-flex-wrap gl-items-center gl-gap-2 gl-p-3"
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
    <slot name="context-actions"></slot>
    <slot name="header-buttons"></slot>
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
    <gl-button :disabled="disabled" category="tertiary" size="small" @click="pasteMarkdown">{{
      s__('ContentEditor|Paste Markdown')
    }}</gl-button>
  </div>
</template>
