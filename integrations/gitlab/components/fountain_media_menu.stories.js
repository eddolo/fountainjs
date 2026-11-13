// eslint-disable-next-line import-x/no-extraneous-dependencies -- Isolated component states use GitLab's existing test dependency.
import { fireEvent, getByRole, waitFor } from '@testing-library/dom';
import { markRaw } from 'vue';
import { GitLabContentEditor, NodeSelection, getGitLabMediaContext } from '../runtime/browser';
import FountainEditorSurface from './fountain_editor_surface.vue';
import FountainMediaMenu from './fountain_media_menu.vue';
import '../services/fountain_runtime.css';

const Template = args => ({
  components: { FountainEditorSurface, FountainMediaMenu },
  data() { return { service: null, ready: false, failure: false }; },
  created() {
    const kind = args.kind || 'image';
    const extension = { image: 'png', audio: 'wav', video: 'webm' }[kind];
    const canonical = `/uploads/media-fixture/figure.${extension}`;
    this.source = `![Selected ${kind}](${canonical})`;
    const image = args.replacement
      ? `<p>Keep writing here.</p><p><a href="/resolved/help/project" data-canonical-src="/help/project"><img src="/-/project/1${canonical}" data-canonical-src="${canonical}" alt="Selected image" title="Authored title" width="240"></a></p>`
      : `<p><a class="no-attachment-icon" href="/-/project/1${canonical}" data-canonical-src="${canonical}"><img src="/-/project/1${canonical}" data-canonical-src="${canonical}" alt="Selected ${kind}"></a></p>`;
    if (args.replacement) this.source = `Keep writing here.\n\n[![Selected image](${canonical} "Authored title"){width="240"}](/help/project)`;
    const replacementSource = '![Replacement file](/uploads/media-fixture/replacement.png)';
    const replacementImage = '<p><img src="/-/project/1/uploads/media-fixture/replacement.png" data-canonical-src="/uploads/media-fixture/replacement.png" alt="Replacement file"></p>';
    const playable = `<p><span class="media-container ${kind}-container"><${kind} src="/-/project/1${canonical}" controls="true" data-setup="{}" data-title="Selected ${kind}" data-canonical-src="${canonical}" class="gfm"></${kind}></span></p>`;
    this.service = markRaw(new GitLabContentEditor({ editable: !args.readOnly, describeLabels: () => '',
      uploadAttachment: args.replacement ? () => Promise.resolve(replacementSource) : undefined,
      renderMarkdown: source => {
        if (source !== this.source && args.reject) return Promise.reject(new Error('Unavailable renderer'));
        const body = kind === 'image' ? image : playable;
        return Promise.resolve({ body: source === replacementSource ? replacementImage : body });
      },
    }));
  },
  async mounted() {
    await this.service.setSerializedContent(this.source);
    let path;
    this.service.editor.state.doc.descendants((node, candidate) => {
      if (!path && ['inline_image', 'gitlab_media'].includes(node.type.name)) path = candidate;
    });
    this.service.editor.dispatch(this.service.editor.createTransaction().setSelection(new NodeSelection(this.service.editor.state.doc, path)));
    this.ready = true;
    await this.$nextTick(); this.$refs.surface.focus();
  },
  beforeDestroy() { this.service.dispose(); },
  methods: {
    getEditorRoot() { return this.$refs.surface?.getRootElement() || null; },
    refreshRoot() { this.$refs.menu?.refreshRoot(); },
    focusEditor() { this.$refs.surface.focus(); },
    changeMedia() {
      const { editor } = this.service;
      const selected = getGitLabMediaContext(editor);
      if (!selected) return;
      const node = selected.path.reduce((parent, index) => parent.child(index), editor.state.doc);
      editor.dispatch(editor.createTransaction().setNodeAttrs(selected.path, { ...node.attrs, alt: 'Changed by another transaction' }));
    },
    async replaceFile({ file, target }) {
      try { await this.service.replaceMediaAttachment(file, target); }
      catch { this.failure = true; }
    },
  },
  template: `<section aria-label="Media component states" class="gl-p-5 md">
    <h1>Native media properties</h1>
    <p>Component fixture. Upload, playback and persistence acceptance use the actual GitLab service separately.</p>
    <p v-if="failure" role="alert">Media replacement failed.</p>
    <fountain-media-menu v-if="service" ref="menu" :content-editor="service" :disabled="!ready || ${Boolean(args.readOnly)}" :allow-upload="${Boolean(args.replacement)}" :get-editor-root="${args.contextual ? 'getEditorRoot' : 'null'}" @focus="focusEditor" @replace-file="replaceFile" />
    <fountain-editor-surface v-if="service" ref="surface" :editor="service.editor" :options="{ ariaLabel: 'Media example document' }" @ready="refreshRoot" />
    <button v-if="ready && !${Boolean(args.readOnly)}" type="button" @click="changeMedia">Change selected media</button>
  </section>`,
});
const open = async ({ canvasElement }) => {
  const button = await waitFor(() => getByRole(canvasElement, 'button', { name: 'Edit media properties' }));
  fireEvent.click(button);
  return waitFor(() => getByRole(document.body, 'dialog', { name: 'Media properties' }));
};
export default { component: FountainMediaMenu, title: 'content_editor/fountain_media_menu' };
export const Image = Template.bind({});
export const Properties = Template.bind({}); Properties.play = open;
export const Audio = Template.bind({}); Audio.args = { kind: 'audio' };
export const Video = Template.bind({}); Video.args = { kind: 'video' };
export const ReadOnly = Template.bind({}); ReadOnly.args = { readOnly: true };
export const ContextualImage = Template.bind({}); ContextualImage.args = { contextual: true };
export const ContextualAudio = Template.bind({}); ContextualAudio.args = { contextual: true, kind: 'audio' };
export const ContextualVideo = Template.bind({}); ContextualVideo.args = { contextual: true, kind: 'video' };
export const ContextualReadOnly = Template.bind({}); ContextualReadOnly.args = { contextual: true, readOnly: true };
export const InvalidSize = Template.bind({});
InvalidSize.play = async context => {
  const dialog = await open(context);
  fireEvent.input(getByRole(dialog, 'textbox', { name: 'Media width' }), { target: { value: 'two em' } });
  fireEvent.click(getByRole(dialog, 'button', { name: 'Apply media changes' }));
  await waitFor(() => getByRole(dialog, 'alert'));
};
export const FailedURL = Template.bind({}); FailedURL.args = { reject: true };
FailedURL.play = async context => {
  const dialog = await open(context);
  fireEvent.input(getByRole(dialog, 'textbox', { name: 'Media URL' }), { target: { value: '/replacement.png' } });
  fireEvent.click(getByRole(dialog, 'button', { name: 'Apply media changes' }));
  await waitFor(() => getByRole(dialog, 'alert'));
};
export const Conflict = Template.bind({});
Conflict.play = async context => {
  const dialog = await open(context);
  fireEvent.input(getByRole(dialog, 'textbox', { name: 'Media description' }), { target: { value: 'Retained draft' } });
  fireEvent.click(getByRole(context.canvasElement, 'button', { name: 'Change selected media' }));
  await waitFor(() => getByRole(dialog, 'alert'));
};
export const Replacement = Template.bind({}); Replacement.args = { replacement: true };
export const AudioProperties = Template.bind({}); AudioProperties.args = { kind: 'audio' }; AudioProperties.play = open;
