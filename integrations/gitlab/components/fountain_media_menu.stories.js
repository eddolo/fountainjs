// eslint-disable-next-line import-x/no-extraneous-dependencies -- Isolated component states use GitLab's existing test dependency.
import { fireEvent, getByRole, waitFor } from '@testing-library/dom';
import { markRaw } from 'vue';
import { GitLabContentEditor, NodeSelection } from '../runtime/browser';
import FountainEditorSurface from './fountain_editor_surface.vue';
import FountainMediaMenu from './fountain_media_menu.vue';
import '../services/fountain_runtime.css';

const Template = args => ({
  components: { FountainEditorSurface, FountainMediaMenu },
  data() { return { service: null, ready: false }; },
  created() {
    const kind = args.kind || 'image';
    const extension = { image: 'png', audio: 'wav', video: 'webm' }[kind];
    const canonical = `/uploads/media-fixture/figure.${extension}`;
    this.source = `![Selected ${kind}](${canonical})`;
    const image = `<p><a class="no-attachment-icon" href="/-/project/1${canonical}" data-canonical-src="${canonical}"><img src="/-/project/1${canonical}" data-canonical-src="${canonical}" alt="Selected ${kind}"></a></p>`;
    const playable = `<p><span class="media-container ${kind}-container"><${kind} src="/-/project/1${canonical}" controls="true" data-setup="{}" data-title="Selected ${kind}" data-canonical-src="${canonical}" class="gfm"></${kind}></span></p>`;
    this.service = markRaw(new GitLabContentEditor({ editable: !args.readOnly, describeLabels: () => '',
      renderMarkdown: source => source !== this.source && args.reject ? Promise.reject(new Error('Unavailable renderer')) : Promise.resolve({ body: kind === 'image' ? image : playable }),
    }));
  },
  async mounted() {
    await this.service.setSerializedContent(this.source);
    this.service.editor.dispatch(this.service.editor.createTransaction().setSelection(new NodeSelection(this.service.editor.state.doc, [0, 0])));
    this.ready = true;
  },
  beforeDestroy() { this.service.dispose(); },
  methods: {
    focusEditor() { this.$refs.surface.focus(); },
    changeMedia() {
      const { editor } = this.service;
      editor.dispatch(editor.createTransaction().setNodeAttrs([0, 0], { ...editor.state.doc.child(0).child(0).attrs, alt: 'Changed by another transaction' }));
    },
  },
  template: `<section aria-label="Media component states" class="gl-p-5 md">
    <h1>Native media properties</h1>
    <p>Component fixture. Upload, playback and persistence acceptance use the actual GitLab service separately.</p>
    <fountain-media-menu v-if="service" :content-editor="service" :disabled="!ready || ${Boolean(args.readOnly)}" @focus="focusEditor" />
    <fountain-editor-surface v-if="service" ref="surface" :editor="service.editor" :options="{ ariaLabel: 'Media example document' }" />
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
