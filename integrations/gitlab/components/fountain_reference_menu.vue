<script>
import { GlAlert, GlButton, GlForm, GlFormGroup, GlFormSelect } from '@gitlab/ui';
import { markRaw } from 'vue';
import { uniqueId } from 'lodash-es';
import { s__ } from '~/locale';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import { getGitLabReferenceContext } from '../runtime/browser';

export default {
  name: 'FountainReferenceMenu',
  components: { GlAlert, GlButton, GlForm, GlFormGroup, GlFormSelect },
  props: {
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, default: false, required: false },
  },
  emits: ['focus'],
  data() {
    return { context: null, session: null, sessionState: null, format: 'id', errorCode: null,
      copyState: null, inputId: uniqueId('fountain-reference-format-') };
  },
  computed: {
    displayContext() { return this.sessionState || this.context; },
    pending() { return Boolean(this.sessionState?.pending); },
    conflict() { return Boolean(this.sessionState?.conflict); },
    choices() {
      const labels = { id: s__('ContentEditor|ID'), title: s__('ContentEditor|Title'), summary: s__('ContentEditor|Summary') };
      return (this.displayContext?.formats || []).map(value => ({ value, text: labels[value] }));
    },
    formError() {
      if (this.conflict || ['GITLAB_INSERTION_TARGET_CHANGED', 'GITLAB_REFERENCE_TARGET_CHANGED'].includes(this.errorCode))
        return s__('ContentEditor|This reference changed. Your display choice is retained. Cancel and select the reference again.');
      if (this.errorCode)
        return s__('ContentEditor|The reference could not be updated. The original reference and your display choice are retained. Retry or cancel.');
      return '';
    },
  },
  created() {
    this.disposed = false;
    this.releaseState = this.contentEditor.editor.subscribe(() => this.refresh());
    this.refresh();
  },
  beforeDestroy() { this.disposed = true; this.releaseState(); this.session?.close(); },
  methods: {
    refresh() {
      if (this.disposed) return;
      const context = getGitLabReferenceContext(this.contentEditor.editor) || null;
      if (context?.href !== this.context?.href || context?.original !== this.context?.original) this.copyState = null;
      this.context = context;
      if (!this.session) this.format = context?.format || 'id';
    },
    begin() {
      if (this.disabled || this.session) return;
      try {
        this.session = markRaw(this.contentEditor.beginReferenceEdit(snapshot => {
          if (!this.disposed) this.sessionState = snapshot;
        }));
        this.sessionState = this.session.snapshot; this.errorCode = null;
      } catch (error) { this.errorCode = error.message; }
    },
    cancel() {
      this.session?.close(); this.session = null; this.sessionState = null; this.errorCode = null;
      this.$nextTick(() => { if (!this.disposed) { this.refresh(); this.$emit('focus'); } });
    },
    onKeydown(event) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault(); event.stopPropagation(); this.cancel();
    },
    onFocusIn(event) { if (event.target.id === this.inputId) this.begin(); },
    async apply() {
      if (this.disabled || this.pending || this.conflict) return;
      this.begin(); const owned = this.session; if (!owned) return;
      this.errorCode = null;
      try {
        const result = await owned.applyFormat(this.format);
        if (this.disposed || owned !== this.session) return;
        const ownsFocus = this.$el.contains(document.activeElement);
        this.session = null; this.sessionState = null; this.refresh();
        if (result.status === 'applied' && ownsFocus) this.$emit('focus');
      } catch (error) { if (!this.disposed && owned === this.session) this.errorCode = error.message; }
    },
    remove() {
      if (this.disabled || this.pending || this.conflict) return;
      this.begin(); if (!this.session) return;
      try {
        this.session.remove(); this.session = null; this.sessionState = null; this.errorCode = null;
        this.refresh(); this.$emit('focus');
      } catch (error) { this.errorCode = error.message; }
    },
    async copy(event) {
      const context = this.displayContext; if (!context) return;
      try {
        await copyToClipboard(new URL(context.href, window.location.href).href, event.currentTarget);
        if (!this.disposed && this.displayContext?.href === context.href) this.copyState = 'copied';
      } catch { if (!this.disposed) this.copyState = 'failed'; }
    },
  },
};
</script>
<template>
  <section v-if="displayContext" class="gl-w-full gl-border-t gl-pt-3" data-testid="native-reference-menu" :aria-label="s__('ContentEditor|Reference controls')" @keydown="onKeydown" @focusin="onFocusIn">
    <p class="gl-mb-3 gl-break-words">{{ displayContext.label }}</p>
    <gl-alert v-if="formError" variant="danger" :dismissible="false" class="gl-mb-3">{{ formError }}</gl-alert>
    <gl-form class="gl-flex gl-flex-wrap gl-items-end gl-gap-3" @submit.stop.prevent="apply">
      <template v-if="choices.length">
        <gl-form-group :label="s__('ContentEditor|Reference display')" :label-for="inputId" class="gl-mb-0 gl-max-w-full">
          <gl-form-select :id="inputId" v-model="format" :options="choices" :disabled="disabled || pending || conflict" />
        </gl-form-group>
        <gl-button type="submit" size="small" :loading="pending" :disabled="disabled || pending || conflict">{{ s__('ContentEditor|Apply reference display') }}</gl-button>
      </template>
      <gl-button v-if="session" size="small" @click="cancel">{{ s__('ContentEditor|Cancel reference edit') }}</gl-button>
      <gl-button size="small" :href="displayContext.href" target="_blank" rel="noopener noreferrer">{{ s__('ContentEditor|Open reference') }}</gl-button>
      <gl-button size="small" @click="copy">{{ s__('ContentEditor|Copy reference URL') }}</gl-button>
      <gl-button size="small" variant="danger" category="secondary" :disabled="disabled || pending || conflict" @click="remove">{{ s__('ContentEditor|Remove reference') }}</gl-button>
    </gl-form>
    <p v-if="pending" role="status" :aria-label="s__('ContentEditor|Reference resolution')" class="gl-mb-0 gl-mt-3">{{ s__('ContentEditor|Resolving reference display…') }}</p>
    <p v-if="copyState === 'copied'" role="status" class="gl-mb-0 gl-mt-3">{{ s__('ContentEditor|Reference URL copied.') }}</p>
    <p v-if="copyState === 'failed'" role="alert" class="gl-mb-0 gl-mt-3">{{ s__('ContentEditor|The URL could not be copied. Open the reference and copy its address from your browser.') }}</p>
  </section>
</template>
