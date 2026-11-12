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
} from '../runtime/browser';

export default {
  name: 'FountainFormattingToolbar',
  components: { GlButton, GlFormSelect },
  props: {
    editor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
  },
  emits: ['focus', 'error', 'paste-markdown'],
  data() {
    return { state: null };
  },
  computed: {
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
          run: () => toggleMark(this.editor, mark),
        })),
        {
          key: 'blockquote',
          label: s__('ContentEditor|Insert a quote'),
          icon: 'quote',
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
      ];
    },
    activeStyle() {
      if (!this.state) return 'paragraph';
      let node = this.state.doc;
      for (const index of this.state.selection.path) {
        if (!node.content[index]) break;
        node = node.child(index);
        if (node.type.name === 'heading') return String(node.attrs.level);
        if (node.type.name === 'code_block') return 'code';
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
      let type = 'heading';
      if (value === 'code') type = 'code_block';
      if (value === 'paragraph') type = 'paragraph';
      this.execute({
        run: () =>
          setBlockType(this.editor, type, /^\d$/u.test(value) ? { level: Number(value) } : {}),
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
      :disabled="disabled"
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
    <slot name="header-buttons"></slot>
    <gl-button :disabled="disabled" category="tertiary" size="small" @click="pasteMarkdown">{{
      s__('ContentEditor|Paste Markdown')
    }}</gl-button>
  </div>
</template>
