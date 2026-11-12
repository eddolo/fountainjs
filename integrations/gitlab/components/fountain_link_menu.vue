<script>
import { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlFormTextarea, GlLink, GlModal, GlPopover } from '@gitlab/ui';
import { uniqueId } from 'lodash-es';
import { markRaw } from 'vue';
import { s__ } from '~/locale';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import { getGitLabLinkContext, getGitLabAlertContext } from '../runtime/browser';

export default {
  name: 'FountainLinkMenu',
  components: { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlFormTextarea, GlLink, GlModal, GlPopover },
  props: {
    contentEditor: { type: Object, required: true },
    getEditorRoot: { type: Function, required: true },
    disabled: { type: Boolean, required: false, default: false },
  },
  emits: ['focus', 'error'],
  data() {
    return { context: null, anchor: null, anchorVersion: 0, root: null, focused: false, available: false, plainTitle: false,
      modalId: uniqueId('fountain-link-'), dialogOpen: false, sessionState: null,
      draftText: '', draftHref: '', errorCode: null, applying: false, copyState: null };
  },
  computed: {
    previewVisible() { return Boolean(this.context && this.anchor?.isConnected && this.root?.contains(this.anchor) && this.focused && !this.dialogOpen); },
    displayURL() {
      if (!this.context) return '';
      try { return new URL(this.context.displayHref, window.location.href).href; }
      catch { return this.context.displayHref; }
    },
    primaryAction() {
      return { text: s__('ContentEditor|Apply link'), attributes: { variant: 'confirm',
        disabled: this.disabled || this.applying || this.sessionState?.conflict
          || this.sessionState?.closed || !this.draftHref.trim(), loading: this.applying } };
    },
    cancelAction() { return { text: s__('ContentEditor|Cancel link edit') }; },
    focusTarget() {
      return { focus: () => { if (!this.disposed && this.root?.isConnected) this.$emit('focus'); } };
    },
    formError() {
      if (this.sessionState?.conflict)
        return s__('ContentEditor|The selected content changed. Your draft is still here. Cancel and reopen the link to review the current content.');
      if (this.errorCode === 'GITLAB_LINK_UNSAFE_URL')
        return s__('ContentEditor|Enter a safe URL, such as an HTTPS address or a relative path.');
      if (this.errorCode === 'GITLAB_LINK_TABLE_LINE_BREAK')
        return s__('ContentEditor|Link text in a table cell must stay on one line. Your draft is retained.');
      if (this.errorCode)
        return s__('ContentEditor|The link could not be updated. Your draft and document are retained. You can correct the fields and try again.');
      return '';
    },
  },
  created() {
    this.disposed = false;
    this.session = null;
    this.rootObserver = null;
    this.releaseState = this.contentEditor.editor.subscribe(() => this.refresh());
  },
  mounted() { this.refreshRoot(); },
  beforeDestroy() {
    this.disposed = true;
    this.releaseState();
    this.session?.close();
    this.unbindRoot();
  },
  methods: {
    unbindRoot() {
      this.rootObserver?.disconnect(); this.rootObserver = null;
      this.root?.removeEventListener('focusin', this.onFocusIn);
      this.root?.removeEventListener('focusout', this.onFocusOut);
      this.root = null;
    },
    refreshRoot() {
      const root = this.getEditorRoot();
      if (root !== this.root) {
        this.unbindRoot(); this.root = root ? markRaw(root) : null;
        root?.addEventListener('focusin', this.onFocusIn);
        root?.addEventListener('focusout', this.onFocusOut);
        if (root && typeof MutationObserver !== 'undefined') {
          // Native view repairs can replace a link without a document transaction.
          this.rootObserver = new MutationObserver(() => {
            if (this.context && (!this.anchor || !root.contains(this.anchor))) this.refresh();
          });
          this.rootObserver.observe(root, { childList: true, subtree: true });
        }
      }
      this.available = Boolean(root?.isConnected);
      this.refresh();
    },
    refresh() {
      if (this.disposed) return;
      this.plainTitle = Boolean(getGitLabAlertContext(this.contentEditor.editor)?.inTitle);
      const context = this.available ? getGitLabLinkContext(this.contentEditor.editor) : null;
      if (context?.displayHref !== this.context?.displayHref) this.copyState = null;
      this.context = context || null;
      this.$nextTick(() => {
        if (this.disposed || !this.root?.isConnected || !this.context) { this.anchor = null; return; }
        const leaf = this.root.querySelector(`[data-fountain-text-path="${this.context.selection.path.join('.')}"]`);
        const anchor = leaf?.closest('a') || leaf?.querySelector('a');
        const next = anchor && this.root.contains(anchor) ? anchor : null;
        // The host popover retains its initial target until it is remounted.
        if (next !== this.anchor) this.anchorVersion += 1;
        this.anchor = next;
      });
    },
    onFocusIn() { this.focused = true; this.refresh(); },
    preserveSelection(event) {
      if (event.target.closest('button')) event.preventDefault();
    },
    onFocusOut(event) {
      const next = event.relatedTarget;
      if (next && (this.root?.contains(next) || this.$el.contains(next) || this.$refs.preview?.contains(next))) return;
      this.focused = false;
    },
    open() {
      if (this.disabled || this.plainTitle || !this.available || !this.root?.isConnected) return false;
      try {
        this.session = markRaw(this.contentEditor.beginLinkEdit(snapshot => {
          if (!this.disposed) this.sessionState = snapshot;
        }));
        this.sessionState = this.session.snapshot;
        this.draftText = this.sessionState.text;
        this.draftHref = this.sessionState.href;
        this.errorCode = null; this.dialogOpen = true;
        return true;
      } catch (error) { this.$emit('error', error); return false; }
    },
    async apply(event) {
      event?.preventDefault();
      if (this.applying || this.disabled || !this.session || this.sessionState?.conflict) return;
      const { session } = this;
      this.applying = true; this.errorCode = null;
      try {
        const result = await session.apply({ href: this.draftHref, text: this.draftText });
        if (this.disposed || !this.dialogOpen || this.session !== session) return;
        if (result.status === 'applied') this.dialogOpen = false;
        else this.errorCode = 'GITLAB_LINK_SESSION_CLOSED';
      } catch (error) {
        if (!this.disposed && this.dialogOpen && this.session === session) this.errorCode = error.message;
      } finally { if (!this.disposed && this.session === session) this.applying = false; }
    },
    onHide(event) {
      // GitLab emits hide for the prevented primary action as well as an actual close.
      if (event?.defaultPrevented) return;
      this.session?.close(); this.session = null; this.applying = false;
    },
    remove() {
      if (this.disabled) return;
      try {
        this.contentEditor.beginLinkEdit().remove();
        this.$emit('focus');
      } catch (error) { this.$emit('error', error); }
    },
    async copy(event) {
      const address = this.displayURL;
      try {
        await copyToClipboard(address, event.currentTarget);
        if (!this.disposed && this.displayURL === address) this.copyState = 'copied';
      } catch {
        if (!this.disposed && this.displayURL === address) this.copyState = 'failed';
      }
    },
  },
};
</script>
<template>
  <div :id="`${modalId}-preview-host`" data-testid="native-link-menu" class="gl-inline-flex">
    <gl-button :disabled="disabled || plainTitle || !available" size="small" icon="link" :aria-label="s__('ContentEditor|Insert or edit link')" :title="s__('ContentEditor|Insert or edit link')" @click="open" />
    <gl-popover v-if="anchor && previewVisible" :key="anchorVersion" :target="anchor" :show="true" triggers="manual" placement="bottom" :title="s__('ContentEditor|Link')" :container="`${modalId}-preview-host`">
      <div ref="preview" @mousedown="preserveSelection" @focusin="onFocusIn" @focusout="onFocusOut">
        <gl-link :href="context.displayHref" :title="displayURL" target="_blank" rel="noopener noreferrer" class="gl-break-all">{{ displayURL }}</gl-link>
        <div class="gl-mt-3 gl-flex gl-flex-wrap gl-gap-2">
          <gl-button size="small" @click="copy">{{ s__('ContentEditor|Copy link URL') }}</gl-button>
          <gl-button size="small" :disabled="disabled" @click="open">{{ s__('ContentEditor|Edit link') }}</gl-button>
          <gl-button size="small" :disabled="disabled" @click="remove">{{ s__('ContentEditor|Remove link') }}</gl-button>
        </div>
        <p v-if="copyState === 'copied'" role="status" class="gl-mt-3">{{ s__('ContentEditor|Link URL copied.') }}</p>
        <p v-if="copyState === 'failed'" role="alert" class="gl-mt-3">{{ s__('ContentEditor|The URL could not be copied. Select and copy the displayed address instead.') }}</p>
      </div>
    </gl-popover>
    <gl-modal v-model="dialogOpen" :modal-id="modalId" :title="s__('ContentEditor|Edit link')" :action-primary="primaryAction" :action-cancel="cancelAction" :return-focus="focusTarget" @primary="apply" @hide="onHide">
      <gl-alert v-if="formError" variant="danger" :dismissible="false" class="gl-mb-3">{{ formError }}</gl-alert>
      <gl-form @submit.prevent="apply">
        <gl-form-group :label="s__('ContentEditor|Link text')" :label-for="`${modalId}-text`">
          <gl-form-textarea :id="`${modalId}-text`" v-model="draftText" :disabled="applying" :maxlength="10000" :rows="2" />
        </gl-form-group>
        <gl-form-group :label="s__('ContentEditor|Link URL')" :label-for="`${modalId}-url`">
          <gl-form-input :id="`${modalId}-url`" v-model="draftHref" :disabled="applying" :maxlength="2048" />
        </gl-form-group>
      </gl-form>
    </gl-modal>
  </div>
</template>
