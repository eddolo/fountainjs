<script>
import { GlAlert, GlButton, GlLoadingIcon } from '@gitlab/ui';
import { debounce, uniqueId } from 'lodash-es';
import { s__ } from '~/locale';
import {
  getSandboxFrameSrc, getIframeHeightFromMessage, openLinkFromMessage,
  BUFFER_IFRAME_HEIGHT, SANDBOX_ATTRIBUTES,
} from '~/behaviors/markdown/render_sandboxed_mermaid';

export default {
  name: 'FountainDiagramPreview',
  components: { GlAlert, GlButton, GlLoadingIcon },
  props: {
    contentEditor: { type: Object, required: true },
    source: { type: String, required: true },
    language: { type: String, required: true },
  },
  data() {
    return { frameSrc: getSandboxFrameSrc(), frameHeight: BUFFER_IFRAME_HEIGHT,
      status: 'loading', imageURL: '', request: 0, frameId: uniqueId('fountain-diagram-preview-') };
  },
  computed: {
    isMermaid() { return this.language === 'mermaid'; },
    previewLabel() { return s__('ContentEditor|Diagram preview'); },
  },
  watch: {
    source() { this.schedule(); },
    language() { this.schedule(); },
  },
  mounted() {
    this.disposed = false;
    this.queue = debounce(this.render, 250);
    window.addEventListener('message', this.onMessage);
    this.render();
  },
  beforeDestroy() {
    this.disposed = true; this.request += 1; this.queue.cancel();
    clearTimeout(this.deadline);
    window.removeEventListener('message', this.onMessage);
  },
  methods: {
    schedule() {
      clearTimeout(this.deadline);
      this.request += 1; this.status = 'loading'; this.imageURL = '';
      this.queue?.();
    },
    postSource() {
      if (!this.isMermaid || this.disposed) return;
      this.$refs.frame?.contentWindow?.postMessage({ source: this.source, proxiedUrls: null,
        fountainRequestId: this.request }, '*');
    },
    onMessage(event) {
      if (!this.isMermaid || event.origin !== 'null' || event.source !== this.$refs.frame?.contentWindow
        || event.data?.fountainRequestId !== this.request) return;
      if (event.data.fountainDiagramError === true) { this.finish('error'); return; }
      if (event.data.href) { if (this.status === 'ready') openLinkFromMessage(event.data); return; }
      const height = getIframeHeightFromMessage(event.data);
      if (height !== null && height > 0 && height <= 10000) {
        this.frameHeight = height; this.finish('ready');
      }
    },
    async render() {
      this.request += 1;
      const { request } = this;
      clearTimeout(this.deadline);
      this.deadline = setTimeout(() => {
        if (!this.disposed && this.request === request) { this.request += 1; this.finish('error'); }
      }, 15000);
      this.status = 'loading'; this.imageURL = '';
      if (this.isMermaid) { await this.$nextTick(); this.postSource(); return; }
      if (this.language !== 'plantuml') { this.finish('error'); return; }
      try {
        const url = await this.contentEditor.renderDiagram(this.source, this.language);
        if (this.disposed || this.request !== request) return;
        if (!url) { this.finish('error'); return; }
        this.imageURL = url;
      } catch { if (!this.disposed && this.request === request) this.finish('error'); }
    },
    finish(status) { clearTimeout(this.deadline); this.status = status; },
    imageLoaded() { this.finish('ready'); },
    imageFailed() { this.finish('error'); },
  },
  sandboxAttributes: SANDBOX_ATTRIBUTES,
};
</script>
<template>
  <section :id="frameId" :aria-label="previewLabel" class="gl-mt-3 gl-w-full gl-rounded-base gl-border gl-p-3" :aria-busy="status === 'loading' ? 'true' : 'false'">
    <p v-if="status === 'loading'" role="status" class="gl-m-0 gl-flex gl-items-center gl-gap-2">
      <gl-loading-icon size="sm" />{{ s__('ContentEditor|Rendering diagram preview…') }}
    </p>
    <gl-alert v-if="status === 'error'" variant="warning" :dismissible="false">
      {{ s__('ContentEditor|The diagram could not be rendered. Check its source and the configured diagram service. Your editable source is retained.') }}
      <gl-button class="gl-ml-3" size="small" @click="render">{{ s__('ContentEditor|Retry diagram preview') }}</gl-button>
    </gl-alert>
    <iframe v-if="isMermaid" v-show="status !== 'error'" ref="frame" :src="frameSrc" :sandbox="$options.sandboxAttributes" :title="s__('ContentEditor|Mermaid diagram preview')" frameborder="0" scrolling="no" width="100%" :height="frameHeight" @load="postSource"></iframe>
    <img v-else-if="imageURL" :key="imageURL" :src="imageURL" :alt="s__('ContentEditor|PlantUML diagram preview; editable source is in the document')" class="gl-max-w-full" @load="imageLoaded" @error="imageFailed" />
  </section>
</template>
