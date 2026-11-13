<script>
import { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput } from '@gitlab/ui';
import { markRaw } from 'vue';
import { uniqueId } from 'lodash-es';
import { s__ } from '~/locale';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import CODE_BLOCK_LANGUAGES from '../constants/code_block_languages';
import { getGitLabCodeContext } from '../runtime/browser';
import FountainDiagramPreview from './fountain_diagram_preview.vue';

export default {
  name: 'FountainCodeMenu',
  components: { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, FountainDiagramPreview },
  props: {
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
  },
  emits: ['focus', 'error'],
  data() {
    return { context: null, session: null, language: '', errorCode: null, copyState: null, showPreview: false,
      inputId: uniqueId('fountain-code-language-'), revision: 0 };
  },
  computed: {
    visible() { return Boolean(this.context || this.session); },
    conflict() { return this.revision >= 0 && Boolean(this.session?.conflict); },
    languages() { return [{ syntax: 'mermaid', label: s__('ContentEditor|Mermaid diagram') }, { syntax: 'plantuml', label: s__('ContentEditor|PlantUML diagram') }, ...CODE_BLOCK_LANGUAGES]; },
    isDiagram() { return ['mermaid', 'plantuml'].includes(this.context?.language); },
    formError() {
      if (this.conflict)
        return s__('ContentEditor|This code block changed. Your language draft is retained. Cancel and select the block again.');
      if (this.errorCode === 'GITLAB_CODE_INVALID_LANGUAGE')
        return s__('ContentEditor|Enter a language label up to 80 characters using letters, numbers, underscores, dots, plus signs, hyphens or hash signs.');
      if (this.errorCode === 'GITLAB_CODE_SPECIALIZED_LANGUAGE')
        return s__('ContentEditor|This language requires a specialized GitLab adapter. The code and your draft are unchanged.');
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
    this.disposed = true; this.releaseState(); this.session?.close();
  },
  methods: {
    onKeydown(event) {
      if (event.key !== 'Escape' || event.isComposing) return;
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
    async copy(event) {
      const { context } = this;
      if (!context) return;
      try {
        await copyToClipboard(context.text, event.currentTarget);
        if (!this.disposed) this.copyState = 'copied';
      } catch { if (!this.disposed) this.copyState = 'failed'; }
    },
  },
};
</script>
<template>
  <section v-if="visible" data-testid="native-code-menu" class="gl-w-full gl-border-t gl-pt-3" :aria-label="s__('ContentEditor|Code block controls')" @keydown="onKeydown">
    <gl-alert v-if="formError" variant="danger" :dismissible="false" class="gl-mb-3">{{ formError }}</gl-alert>
    <gl-form class="gl-flex gl-flex-wrap gl-items-end gl-gap-3" @submit.stop.prevent="apply">
      <gl-form-group :label="s__('ContentEditor|Code language')" :label-for="inputId" class="gl-mb-0 gl-max-w-full">
        <gl-form-input :id="inputId" v-model="language" :list="`${inputId}-options`" :disabled="disabled || conflict" :maxlength="80" autocomplete="off" @focus="begin" />
        <datalist :id="`${inputId}-options`">
          <option v-for="item in languages" :key="item.syntax" :value="item.syntax">{{ item.label }}</option>
        </datalist>
      </gl-form-group>
      <gl-button type="submit" size="small" :disabled="disabled || conflict || !language.trim()">{{ s__('ContentEditor|Apply language') }}</gl-button>
      <gl-button v-if="session" size="small" @click="cancel">{{ s__('ContentEditor|Cancel language edit') }}</gl-button>
      <gl-button size="small" :disabled="!context" @click="copy">{{ s__('ContentEditor|Copy code') }}</gl-button>
      <gl-button size="small" variant="danger" category="secondary" :disabled="disabled || conflict" @click="remove">{{ s__('ContentEditor|Delete code block') }}</gl-button>
    </gl-form>
    <p v-if="copyState === 'copied'" role="status" class="gl-mb-0 gl-mt-3">{{ s__('ContentEditor|Code copied.') }}</p>
    <p v-if="copyState === 'failed'" role="alert" class="gl-mb-0 gl-mt-3">{{ s__('ContentEditor|The code could not be copied. Select it in the editor and use your browser copy command.') }}</p>
    <gl-button v-if="isDiagram" class="gl-mt-3" size="small" :aria-expanded="showPreview ? 'true' : 'false'" @click="showPreview = !showPreview">
      {{ showPreview ? s__('ContentEditor|Hide diagram preview') : s__('ContentEditor|Show diagram preview') }}
    </gl-button>
    <fountain-diagram-preview v-if="isDiagram && showPreview" :content-editor="contentEditor" :source="context.text" :language="context.language" />
  </section>
</template>
