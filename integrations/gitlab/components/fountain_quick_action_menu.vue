<script>
import { GlButton } from '@gitlab/ui';
import { markRaw } from 'vue';
import { uniqueId } from 'lodash-es';
import FountainContextSurface from './fountain_context_surface.vue';

export default {
  name: 'FountainQuickActionMenu',
  components: { GlButton, FountainContextSurface },
  props: {
    contentEditor: { type: Object, required: true },
    getEditorRoot: { type: Function, required: true },
    disabled: { type: Boolean, default: false, required: false },
  },
  emits: ['focus', 'error'],
  data() {
    return { preview: null, suggestions: null, dismissed: false, floating: false,
      expanded: false, listId: uniqueId('fountain-quick-actions-') };
  },
  computed: {
    active() { return Boolean(this.preview?.context && !this.disabled && !this.dismissed); },
    listVisible() { return this.active && this.suggestions?.open && (!this.floating || this.expanded); },
    selectedId() { return this.suggestions?.selectedIndex >= 0 ? this.optionId(this.suggestions.selectedIndex) : undefined; },
  },
  watch: {
    active() { this.$nextTick(this.syncAria); },
    listVisible() { this.$nextTick(this.syncAria); },
    selectedId() { this.$nextTick(() => { this.syncAria(); this.scrollSelected(); }); },
  },
  created() {
    this.disposed = false; this.ariaRoot = null; this.originalAria = null;
    this.actions = markRaw(this.contentEditor.quickActions);
    this.preview = markRaw(this.actions.getSnapshot());
    this.suggestions = this.actions.suggestions ? markRaw(this.actions.suggestions.getSnapshot()) : null;
    this.releasePreview = this.actions.subscribe(value => { this.preview = markRaw(value); });
    this.releaseSuggestions = this.actions.suggestions?.subscribe(value => { this.suggestions = markRaw(value); });
    let previous = this.contentEditor.editor.state;
    this.releaseState = this.contentEditor.editor.subscribe(state => {
      if (state.doc !== previous.doc || !state.selection.eq(previous.selection)) this.dismissed = false;
      previous = state;
    });
  },
  mounted() { this.refreshRoot(); },
  beforeDestroy() {
    this.disposed = true; this.releasePreview(); this.releaseSuggestions?.(); this.releaseState(); this.restoreAria();
  },
  methods: {
    refreshRoot() { this.$refs.surface?.refreshRoot(); this.$nextTick(this.syncAria); },
    optionId(index) { return `${this.listId}-${index}`; },
    visibilityChanged({ floating, expanded }) { this.floating = floating; this.expanded = expanded; },
    restoreAria() {
      if (this.ariaRoot) for (const [name, value] of this.originalAria) {
        if (value === null) this.ariaRoot.removeAttribute(name); else this.ariaRoot.setAttribute(name, value);
      }
      this.ariaRoot = null; this.originalAria = null;
    },
    syncAria() {
      if (this.disposed) return;
      const root = this.getEditorRoot();
      if (!this.listVisible || root !== this.ariaRoot) this.restoreAria();
      if (!this.listVisible || !root) return;
      if (!this.ariaRoot) {
        this.ariaRoot = root;
        this.originalAria = ['aria-controls', 'aria-activedescendant', 'aria-autocomplete'].map(name => [name, root.getAttribute(name)]);
      }
      root.setAttribute('aria-controls', this.listId); root.setAttribute('aria-autocomplete', 'list');
      if (this.selectedId) root.setAttribute('aria-activedescendant', this.selectedId); else root.removeAttribute('aria-activedescendant');
    },
    scrollSelected() {
      const { list } = this.$refs;
      const option = list?.querySelector('[aria-selected="true"]');
      if (!option) return;
      const top = option.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      const bottom = top + option.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    },
    dismiss() { this.dismissed = true; this.actions.suggestions?.dismiss(); },
    accept(item) {
      if (this.disabled) return;
      try {
        if (this.actions.accept(item)) this.$emit('focus');
      } catch (error) { this.$emit('error', error); }
    },
    setLiteral() {
      if (this.disabled) return;
      try {
        if (this.actions.setLiteral(!this.preview.context.literal)) this.$emit('focus');
      } catch (error) { this.$emit('error', error); }
    },
    onKeydown(event) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); this.dismiss(); this.$emit('focus'); return;
      }
      if (!this.suggestions?.open) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation(); this.actions.suggestions.move(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Enter' && this.suggestions.selectedIndex >= 0) {
        event.preventDefault(); event.stopPropagation(); this.accept(this.suggestions.items[this.suggestions.selectedIndex]);
      }
    },
    retrySuggestions() { this.actions.suggestions?.invalidate(); },
    retryPreview() { this.actions.retryPreview(); },
  },
};
</script>
<template>
  <fountain-context-surface v-if="actions.enabled && active" ref="surface" :editor="contentEditor.editor"
    :active="active" :anchor-path="preview?.context?.path || null" :get-editor-root="getEditorRoot"
    :label="s__('ContentEditor|Quick actions')" hide-trigger @dismiss="dismiss" @visibility-change="visibilityChanged">
    <section v-if="active" data-testid="native-quick-action-menu" :aria-label="s__('ContentEditor|Quick action controls')" @keydown="onKeydown">
      <p class="gl-mb-2 gl-font-bold">{{ preview.context.literal ? s__('ContentEditor|Literal text') : s__('ContentEditor|Quick action') }}</p>
      <template v-if="suggestions?.open">
        <p v-if="suggestions.status === 'loading'" role="status" class="gl-mb-3">{{ s__('ContentEditor|Loading available commands…') }}</p>
        <div v-else-if="suggestions.status === 'error'" role="alert" class="gl-mb-3">
          <p>{{ s__('ContentEditor|Available commands could not be loaded. Your text is retained.') }}</p>
          <gl-button size="small" category="tertiary" @click="retrySuggestions">{{ s__('ContentEditor|Retry commands') }}</gl-button>
        </div>
        <p v-else-if="!suggestions.items.length" role="status" class="gl-mb-3">{{ s__('ContentEditor|No matching command is available here.') }}</p>
        <div :id="listId" ref="list" role="listbox" tabindex="0" :aria-label="s__('ContentEditor|Available quick actions')"
          :aria-activedescendant="selectedId" class="gl-relative gl-max-h-31 gl-overflow-y-auto gl-mb-3">
          <gl-button v-for="(item, index) in suggestions.items" :id="optionId(index)" :key="item.id" role="option"
            tabindex="-1" :aria-selected="index === suggestions.selectedIndex ? 'true' : 'false'" :selected="index === suggestions.selectedIndex"
            category="tertiary" class="gl-w-full gl-justify-start gl-text-left" button-text-classes="gl-w-full gl-min-w-0 !gl-whitespace-normal gl-text-left" @mousedown.prevent @click="accept(item)">
            <span class="gl-block gl-break-words"><strong>{{ item.label }}</strong><span v-if="item.params.length"> {{ item.params.join(' ') }}</span>
              <span class="gl-block gl-text-subtle">{{ item.description }}</span>
              <span v-if="item.warning" class="gl-block gl-text-warning">{{ item.warning }}</span>
            </span>
          </gl-button>
        </div>
      </template>
      <div role="status" class="gl-mb-3">
        <template v-if="preview.status === 'literal'">{{ s__('ContentEditor|This line stays text. It will not run as a quick action.') }}</template>
        <template v-else-if="preview.status === 'loading'">{{ s__('ContentEditor|Checking this command with GitLab…') }}</template>
        <template v-else-if="preview.status === 'error'">{{ s__('ContentEditor|The command preview is unavailable. Check the source before saving.') }}</template>
        <template v-else-if="preview.explanation"><strong>{{ s__('ContentEditor|On Save:') }}</strong> {{ preview.explanation }}</template>
        <template v-else>{{ s__('ContentEditor|Commands run only when you save. Enter a command and its arguments to preview the effect.') }}</template>
      </div>
      <div class="gl-border-t gl-pt-2 gl-flex gl-flex-wrap gl-gap-2">
        <gl-button v-if="preview.status === 'error'" size="small" category="tertiary" @click="retryPreview">{{ s__('ContentEditor|Retry command preview') }}</gl-button>
        <gl-button :disabled="disabled" size="small" category="tertiary" @click="setLiteral">{{ preview.context.literal ? s__('ContentEditor|Treat as quick action') : s__('ContentEditor|Treat as literal text') }}</gl-button>
      </div>
    </section>
  </fountain-context-surface>
</template>
