<script>
import { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlLink, GlModal } from '@gitlab/ui';
import { uniqueId } from 'lodash-es';
import { markRaw } from 'vue';
import { s__ } from '~/locale';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import { getGitLabMediaContext } from '../runtime/browser';

export default {
  name: 'FountainMediaMenu',
  components: { GlAlert, GlButton, GlForm, GlFormGroup, GlFormInput, GlLink, GlModal },
  props: {
    contentEditor: { type: Object, required: true },
    disabled: { type: Boolean, required: false, default: false },
    allowUpload: { type: Boolean, required: false, default: false },
  },
  emits: ['focus', 'error', 'replace-file'],
  data() {
    return { context: null, dialogOpen: false, sessionState: null, modalId: uniqueId('fountain-media-'),
      draftURL: '', draftAlt: '', draftTitle: '', draftWidth: 'auto', draftHeight: 'auto',
      applying: false, errorCode: null, copyState: null, previewFailed: false };
  },
  computed: {
    primaryAction() {
      return { text: s__('ContentEditor|Apply media changes'), attributes: { variant: 'confirm',
        disabled: this.disabled || this.applying || this.sessionState?.closed || this.sessionState?.conflict,
        loading: this.applying } };
    },
    cancelAction() { return { text: s__('ContentEditor|Cancel media edit') }; },
    focusTarget() { return { focus: () => { if (!this.disposed) this.$emit('focus'); } }; },
    formError() {
      if (this.sessionState?.conflict)
        return s__('ContentEditor|The selected media changed. Your draft is retained. Cancel and reopen its properties to review the current item.');
      if (this.errorCode === 'GITLAB_MEDIA_INVALID_URL')
        return s__('ContentEditor|Enter a web URL or a relative media path.');
      if (this.errorCode === 'GITLAB_MEDIA_INVALID_DIMENSION')
        return s__('ContentEditor|Enter a pixel size, a percentage, or auto.');
      if (this.errorCode === 'GITLAB_MEDIA_INVALID_DESCRIPTION')
        return s__('ContentEditor|Descriptions and titles must stay on one line.');
      if (this.errorCode === 'GITLAB_MEDIA_CANONICAL_SOURCE_REQUIRED')
        return s__('ContentEditor|GitLab did not provide the original media URL. Enter its original URL before applying changes.');
      if (this.errorCode === 'GITLAB_MEDIA_LINKED_CONVERSION_REQUIRED')
        return s__('ContentEditor|This linked image cannot become another media type while retaining its link. Insert the new media separately.');
      if (this.errorCode)
        return s__('ContentEditor|The media could not be updated. Your draft and document are retained. Check the fields or connection and try again.');
      return '';
    },
  },
  created() {
    this.disposed = false; this.session = null; this.refresh();
    this.releaseState = this.contentEditor.editor.subscribe(() => this.refresh());
  },
  beforeDestroy() {
    this.disposed = true; this.releaseState(); this.session?.close(); this.stopPreview();
  },
  methods: {
    refresh() { this.context = getGitLabMediaContext(this.contentEditor.editor) || null; this.copyState = null; },
    open() {
      if (this.disabled || !this.context) return;
      try {
        this.session = markRaw(this.contentEditor.beginMediaEdit(snapshot => { if (!this.disposed) this.sessionState = snapshot; }));
        this.sessionState = this.session.snapshot;
        const { canonical, alt, title, width, height } = this.sessionState;
        this.draftURL = canonical; this.draftAlt = alt; this.draftTitle = title;
        this.draftWidth = width; this.draftHeight = height;
        this.errorCode = null; this.previewFailed = false; this.dialogOpen = true;
      } catch (error) { this.$emit('error', error); }
    },
    async apply(event) {
      event?.preventDefault();
      if (this.disabled || this.applying || !this.session || this.sessionState?.conflict) return;
      const { session } = this; this.applying = true; this.errorCode = null;
      try {
        const result = await session.apply({ canonical: this.draftURL, alt: this.draftAlt, title: this.draftTitle,
          width: this.draftWidth.trim() || 'auto', height: this.draftHeight.trim() || 'auto' });
        if (!this.disposed && this.dialogOpen && this.session === session && result.status === 'applied') this.dialogOpen = false;
      } catch (error) {
        if (!this.disposed && this.dialogOpen && this.session === session) this.errorCode = error.message;
      } finally { if (!this.disposed && this.session === session) this.applying = false; }
    },
    stopPreview() { this.$refs.previewMedia?.pause(); },
    onHide(event) {
      if (event?.defaultPrevented) return;
      this.stopPreview(); this.session?.close(); this.session = null; this.applying = false;
    },
    remove() {
      if (this.disabled) return;
      try { this.contentEditor.beginMediaEdit().remove(); this.$emit('focus'); }
      catch (error) { this.$emit('error', error); }
    },
    async copy(event) {
      if (!this.context) return;
      const address = this.context.canonical;
      try {
        await copyToClipboard(address, event.currentTarget);
        if (!this.disposed && this.context?.canonical === address) this.copyState = 'copied';
      } catch { if (!this.disposed) this.copyState = 'failed'; }
    },
    replaceFile(event) {
      const input = event.target;
      const [file] = input.files; input.value = '';
      if (file && this.allowUpload && !this.disabled) this.$emit('replace-file', file);
    },
  },
};
</script>
<template>
  <div v-if="context" data-testid="native-media-menu" class="gl-inline-flex gl-flex-wrap gl-items-center gl-gap-2" role="group" :aria-label="s__('ContentEditor|Media controls')">
    <gl-button :disabled="disabled" size="small" @click="open">{{ s__('ContentEditor|Edit media properties') }}</gl-button>
    <gl-link :href="context.displayURL" target="_blank" rel="noopener noreferrer">{{ s__('ContentEditor|Open media') }}</gl-link>
    <gl-button size="small" @click="copy">{{ s__('ContentEditor|Copy media URL') }}</gl-button>
    <gl-button :disabled="disabled" size="small" @click="remove">{{ s__('ContentEditor|Delete media') }}</gl-button>
    <template v-if="allowUpload">
      <gl-button :disabled="disabled" size="small" @click="$refs.file.click()">{{ s__('ContentEditor|Replace media file') }}</gl-button>
      <input ref="file" type="file" :accept="`${context.kind}/*`" class="gl-hidden" :disabled="disabled" :aria-label="s__('ContentEditor|Replacement media file')" @change="replaceFile" />
    </template>
    <span v-if="copyState === 'copied'" role="status">{{ s__('ContentEditor|Media URL copied.') }}</span>
    <span v-if="copyState === 'failed'" role="alert">{{ s__('ContentEditor|Unable to copy the media URL. Open the media and copy its address instead.') }}</span>
    <gl-modal v-model="dialogOpen" :modal-id="modalId" :title="s__('ContentEditor|Media properties')" :action-primary="primaryAction" :action-cancel="cancelAction" :return-focus="focusTarget" @primary="apply" @hide="onHide">
      <template v-if="sessionState">
        <img v-if="sessionState.kind === 'image'" :src="sessionState.displayURL" :alt="sessionState.alt" class="gl-mb-4 gl-max-h-48 gl-max-w-full" @error="previewFailed = true" />
        <audio v-else-if="sessionState.kind === 'audio'" ref="previewMedia" :src="sessionState.displayURL" controls preload="metadata" :aria-label="sessionState.alt || s__('ContentEditor|Audio preview')" class="gl-mb-4 gl-max-w-full" @error="previewFailed = true"></audio>
        <video v-else ref="previewMedia" :src="sessionState.displayURL" controls preload="metadata" :aria-label="sessionState.alt || s__('ContentEditor|Video preview')" class="gl-mb-4 gl-max-h-48 gl-max-w-full" @error="previewFailed = true"></video>
        <p v-if="previewFailed" role="status">{{ s__('ContentEditor|The preview could not load. The original URL and document are retained.') }}</p>
        <gl-alert v-if="formError" variant="danger" :dismissible="false" class="gl-mb-3">{{ formError }}</gl-alert>
        <gl-form @submit.stop.prevent="apply">
          <!-- The modal footer is outside this form; retain native Enter submission. -->
          <button type="submit" class="gl-hidden"></button>
          <gl-form-group :label="s__('ContentEditor|Media URL')" :label-for="`${modalId}-url`"><gl-form-input :id="`${modalId}-url`" v-model="draftURL" :disabled="applying" :maxlength="2048" /></gl-form-group>
          <gl-form-group :label="s__('ContentEditor|Media description')" :label-for="`${modalId}-alt`"><gl-form-input :id="`${modalId}-alt`" v-model="draftAlt" :disabled="applying" :maxlength="10000" /></gl-form-group>
          <gl-form-group :label="s__('ContentEditor|Media title')" :label-for="`${modalId}-title`"><gl-form-input :id="`${modalId}-title`" v-model="draftTitle" :disabled="applying" :maxlength="10000" /></gl-form-group>
          <p>{{ s__('ContentEditor|Use pixels, a percentage, or auto. Automatic height keeps the original aspect ratio.') }}</p>
          <gl-form-group :label="s__('ContentEditor|Media width')" :label-for="`${modalId}-width`"><gl-form-input :id="`${modalId}-width`" v-model="draftWidth" :disabled="applying" :maxlength="40" /></gl-form-group>
          <gl-form-group :label="s__('ContentEditor|Media height')" :label-for="`${modalId}-height`"><gl-form-input :id="`${modalId}-height`" v-model="draftHeight" :disabled="applying" :maxlength="40" /></gl-form-group>
        </gl-form>
      </template>
    </gl-modal>
  </div>
</template>
