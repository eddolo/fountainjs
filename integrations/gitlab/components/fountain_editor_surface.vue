<script>
import { EditorView } from 'fountainjs-editor';

export default {
  name: 'FountainEditorSurface',
  inheritAttrs: false,
  props: {
    editor: { type: Object, required: true },
    options: { type: Object, default: () => ({}) },
    editable: { type: Boolean, default: undefined },
  },
  emits: ['ready', 'error', 'focus', 'blur', 'keydown'],
  created() {
    // The host service owns the model; Vue owns only this browser view.
    this.fountainView = null;
  },
  mounted() {
    this.mountSurface();
  },
  beforeDestroy() {
    this.releaseSurface();
  },
  watch: {
    editor() { this.mountSurface(); },
    options() { this.mountSurface(); },
    editable() {
      if (this.syncInteractionMode() && !this.fountainView) this.mountSurface();
    },
  },
  methods: {
    syncInteractionMode() {
      if (typeof this.editable !== 'boolean' || this.editor.editable === this.editable) return true;
      try {
        if (!this.editor.setEditable(this.editable)) throw new Error('The editor refused the interaction-mode change.');
        return true;
      } catch (error) {
        this.releaseSurface();
        this.$emit('error', error);
        return false;
      }
    },
    mountSurface() {
      this.releaseSurface();
      if (!this.$refs.mount || !this.syncInteractionMode()) return;
      try {
        if (this.editor.isDestroyed) throw new Error('Cannot mount a destroyed Fountain editor.');
        this.fountainView = new EditorView(this.$refs.mount, this.editor, this.options);
        const { dom } = this.fountainView;
        dom.addEventListener('focusin', this.onFocus);
        dom.addEventListener('focusout', this.onBlur);
        dom.addEventListener('keydown', this.onKeydown);
        this.$emit('ready', this.fountainView);
      } catch (error) {
        this.releaseSurface();
        this.$emit('error', error);
      }
    },
    releaseSurface() {
      const view = this.fountainView;
      this.fountainView = null;
      if (!view) return;
      view.dom.removeEventListener('focusin', this.onFocus);
      view.dom.removeEventListener('focusout', this.onBlur);
      view.dom.removeEventListener('keydown', this.onKeydown);
      view.destroy();
    },
    focus(position) { this.fountainView?.focus(position); },
    onFocus(event) {
      if (!this.fountainView?.dom.contains(event.relatedTarget)) this.$emit('focus', event);
    },
    onBlur(event) {
      if (!this.fountainView?.dom.contains(event.relatedTarget)) this.$emit('blur', event);
    },
    onKeydown(event) { this.$emit('keydown', event); },
  },
};
</script>
<template>
  <div ref="mount" data-fountain-root="gitlab" v-bind="$attrs"></div>
</template>
