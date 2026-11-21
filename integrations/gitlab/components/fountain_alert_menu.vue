<script>
import { GlButton, GlFormSelect } from '@gitlab/ui';
import { s__ } from '~/locale';
import { getGitLabAlertContext } from '../runtime/browser';

export default {
  name: 'FountainAlertMenu',
  components: { GlButton, GlFormSelect },
  props: {
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
  },
  emits: ['focus', 'error'],
  data() { return { context: null, selectVersion: 0, canEdit: false }; },
  computed: {
    types() {
      return [
        { value: 'note', text: s__('ContentEditor|Note') },
        { value: 'tip', text: s__('ContentEditor|Tip') },
        { value: 'important', text: s__('ContentEditor|Important') },
        { value: 'warning', text: s__('ContentEditor|Warning') },
        { value: 'caution', text: s__('ContentEditor|Caution') },
      ];
    },
    unavailable() { return this.disabled || !this.canEdit; },
  },
  created() {
    this.refresh();
    this.releaseState = this.contentEditor.editor.subscribe(() => this.refresh());
  },
  beforeDestroy() { this.releaseState(); },
  methods: {
    refresh() {
      this.canEdit = this.contentEditor.editor.editable;
      this.context = getGitLabAlertContext(this.contentEditor.editor) || null;
    },
    execute(action, value) {
      if (this.unavailable) { this.selectVersion += 1; this.refresh(); return; }
      try {
        this.contentEditor.alerts[action](value);
        this.$emit('focus');
      } catch (error) {
        // Reset the native select even when the rejected transaction leaves its value unchanged.
        this.selectVersion += 1;
        this.refresh();
        this.$emit('error', error);
      }
    },
  },
};
</script>
<template>
  <div data-testid="native-alert-menu" class="gl-inline-flex gl-flex-wrap gl-items-center gl-gap-2">
    <gl-button :disabled="unavailable" size="small" category="tertiary" icon="attention"
      :aria-label="s__('ContentEditor|Insert alert')" :title="s__('ContentEditor|Insert alert')" @click="execute('insert')" />
    <template v-if="context">
      <gl-form-select :key="selectVersion" :value="context.kind" :options="types" :disabled="unavailable" :aria-label="s__('ContentEditor|Alert type')" class="gl-w-auto" @change="execute('setKind', $event)" />
      <gl-button :disabled="unavailable" size="small" @click="execute('unwrap')">{{ s__('ContentEditor|Convert alert to text') }}</gl-button>
      <gl-button :disabled="unavailable" size="small" @click="execute('remove')">{{ s__('ContentEditor|Delete alert') }}</gl-button>
    </template>
  </div>
</template>
