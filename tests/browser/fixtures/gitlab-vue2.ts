import Vue from '../../../tools/gitlab-bridge/runtime';
import Surface from '../../../integrations/gitlab/components/fountain_editor_surface.vue?gitlab-vue2';
import {
  CoreSchemaSpec,
  MarkdownExporter,
  MarkdownImporter,
  Plugin,
  createEditor,
  createHistoryPlugin,
  canUndo,
  canRedo,
  undo,
  redo,
  setTextAlignment,
  createMathExtension,
  createKaTeXRenderer,
  insertInlineMath,
  insertText,
} from 'fountainjs-editor';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { SerializedContentController } from '../../../integrations/gitlab/services/serialized_content';
import {
  GitLabMarkdownCodec,
  createGitLabSchemaSpec,
} from '../../../integrations/gitlab/services/markdown_codec';
import { createGitLabReferenceNavigationPlugin } from '../../../integrations/gitlab/plugins/reference_navigation';
import gitlabHTML from '../../../integrations/gitlab/fixtures/service-html.json';
import gitlabMath from '../../../integrations/gitlab/fixtures/math-html.json';
import handoffContract from '../../../integrations/gitlab/fixtures/handoff-methods.json';
import {
  bindMarkdownSubmission,
  prepareMarkdownSubmission,
  validateMarkdownSubmission,
  completeMarkdownSubmission,
} from '../../../integrations/gitlab/services/submission.js';
import 'fountainjs-editor/styles.css';

const vetoMode = new URLSearchParams(location.search).has('reject-mode');
const gitlabRendered = new URLSearchParams(location.search).has('gitlab-rendered');
const mathRenderer = createKaTeXRenderer(katex);
const nativeMath = createMathExtension({
  inputRules: false,
  pasteRules: false,
  documentRenderer: (latex, context) =>
    mathRenderer(latex, {
      ...context,
      displayMode: context.displayMode || context.node.attrs.gitlabMathSyntax === 'display',
    }),
});
const gitlabSchema = createGitLabSchemaSpec({
  ...CoreSchemaSpec,
  nodes: { ...CoreSchemaSpec.nodes, ...nativeMath.nodes },
});
const editor = createEditor({
  schema: gitlabRendered ? gitlabSchema : CoreSchemaSpec,
  plugins: [
    createHistoryPlugin(),
    ...(gitlabRendered ? [createGitLabReferenceNavigationPlugin()] : []),
    ...(vetoMode
      ? [
          new Plugin({
            filterTransaction: (transaction) =>
              transaction.docChanged || transaction.getMeta('force') !== true,
          }),
        ]
      : []),
  ],
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vue 2 integration.' }] }],
  },
});
const fileInputs: { source: string; names: string[] }[] = [];
const fileContract = new URLSearchParams(location.search).has('file-input-contract');
const rejectFiles = new URLSearchParams(location.search).has('reject-files');
const options = Object.freeze({ ariaLabel: 'GitLab Vue 2 bridge editor', placeholder: 'Write your document',
  ...(fileContract ? { handleFiles: (files: readonly File[], context: import('fountainjs-editor').FileInputContext) => {
    fileInputs.push({ source: context.source, names: files.map(file => file.name) });
    if (rejectFiles) throw new Error('HOST_FILE_INPUT_REFUSED');
    for (const file of files) insertText(context.editor, `[file:${file.name}]`);
  } } : {}),
});
// Real ordinary-Markdown codec for lifecycle tests only. The actual GitLab
// dialect/service adapter remains required before application integration.
const ordinaryCodec = {
  async deserialize({ schema, markdown }) {
    return { document: MarkdownImporter.parse(markdown, schema) };
  },
  serialize: ({ doc }) => new MarkdownExporter().export(doc),
} satisfies import('../../../integrations/gitlab/services/serialized_content').SerializedContentCodec;
// Private contract input, not a simulated GitLab product/service. This branch
// verifies real converter/view behavior against immutable upstream HTML only.
const pinnedGitLabCodec = new GitLabMarkdownCodec({
  renderMarkdown: async (markdown) => {
    const math = gitlabMath.rows.find((row) => row.markdown === markdown);
    if (math) return { body: math.html };
    if (markdown !== 'See #1 and !1 by @root with ~bug in b51c8ef20575')
      throw new Error('This private contract fixture has no live GitLab renderer.');
    return { body: gitlabHTML.fixtures.RESOLVED_REFERENCES_PARAGRAPH_HTML };
  },
});
const content = new SerializedContentController(
  editor,
  gitlabRendered ? pinnedGitLabCodec : ordinaryCodec,
);
// Execute only the captured patched host method in this private contract page.
const changeEditingMode = new Function(
  'EDITING_MODE_CONTENT_EDITOR',
  'EDITING_MODE_MARKDOWN_FIELD',
  's__',
  `return ({ ${handoffContract.files.find((file) => file.kind === 'host')!.code} }).onEditingModeChange;`,
)('contentEditor', 'markdownField', (value: string) => value.split('|').slice(1).join('|'));
const setupSubmission = new Function(
  'bindMarkdownSubmission',
  's__',
  `return ({ ${handoffContract.files.find((file) => file.kind === 'submission-binding')!.code} }).setupSubmissionBinding;`,
)(bindMarkdownSubmission, (value: string) => value.split('|').slice(1).join('|'));
const submissionValue = new Function(
  `return ({ ${handoffContract.files.find((file) => file.kind === 'submission-value')!.code} }).getValue;`,
)();
let unsubscribe: (() => void) | undefined;
let unsubscribeChange: (() => void) | undefined;
let releaseTransport: (() => void) | undefined;
const app = new Vue({
  data: () => ({
    editable: true,
    fileInputs,
    visible: true,
    ready: 0,
    revision: 0,
    error: '',
    serializationError: '',
    markdown: '',
    changes: 0,
    serialized: '',
    loading: false,
    editingMode: 'contentEditor',
    alert: null as { message: string } | null,
    submissionBinding: undefined as ReturnType<typeof bindMarkdownSubmission> | undefined,
    draft: '',
    submissions: 0,
    submitted: '',
    autosaveKey: 'private-contract',
  }),
  computed: {
    isContentEditorActive(): boolean {
      return this.editingMode === 'contentEditor';
    },
  },
  mounted() {
    setupSubmission.call(this);
  },
  beforeDestroy() {
    releaseTransport?.();
    this.submissionBinding?.dispose();
    unsubscribe?.();
    unsubscribeChange?.();
    content.dispose();
  },
  methods: {
    getValue(): string {
      return submissionValue.call(this);
    },
    saveDraft() {
      this.draft = this.markdown;
    },
    clearDraft() {
      this.draft = '';
    },
    onEditingModeChange(mode: string): Promise<void> {
      return changeEditingMode.call(this, mode);
    },
    updateMarkdownFromContentEditor({ markdown }: { markdown: string }) {
      this.markdown = markdown;
      this.saveDraft();
    },
    notifyEditingModeChange() {
      /* Focus behavior belongs to the real GitLab host, outside this fixture. */
    },
    readForHandoff() {
      if (this.loading) throw new Error('Markdown is still loading.');
      return content.getSerializedContent();
    },
    async beforeContentEditor(markdown: string) {
      this.loading = true;
      try {
        const result = await content.setSerializedContent(markdown);
        if (result.status !== 'applied') return false;
        this.serialized = content.getSerializedContent();
        this.serializationError = '';
        return true;
      } catch (error) {
        this.error = String(error);
        return false;
      } finally {
        this.loading = false;
      }
    },
    async replaceMarkdown(addToHistory: boolean) {
      this.loading = true;
      this.error = '';
      try {
        const result = await content.setSerializedContent(this.markdown, { addToHistory });
        if (result.status === 'applied') {
          this.serialized = content.getSerializedContent();
          this.serializationError = '';
          this.saveDraft();
        }
      } catch (error) {
        this.error = String(error);
      } finally {
        this.loading = false;
      }
    },
  },
  render(h) {
    void this.revision;
    return h('section', [
      h('output', { attrs: { 'aria-label': 'Host file input events' } }, JSON.stringify(this.fileInputs)),
      h('nav', { attrs: { 'aria-label': 'Bridge host controls' } }, [
        h(
          'button',
          {
            attrs: { type: 'button' },
            on: {
              click: () => {
                this.editable = !this.editable;
              },
            },
          },
          this.editable ? 'Use read-only mode' : 'Enable editing',
        ),
        h(
          'button',
          {
            attrs: { type: 'button' },
            on: {
              click: () => {
                this.visible = !this.visible;
              },
            },
          },
          this.visible ? 'Detach surface' : 'Attach surface',
        ),
        h(
          'button',
          {
            attrs: { type: 'button', disabled: !this.editable || !canUndo(editor) },
            on: { click: () => undo(editor) },
          },
          'Undo document',
        ),
        h(
          'button',
          {
            attrs: { type: 'button', disabled: !this.editable || !canRedo(editor) },
            on: { click: () => redo(editor) },
          },
          'Redo document',
        ),
        h(
          'button',
          {
            attrs: { type: 'button', disabled: !this.editable },
            on: {
              mousedown: (event: MouseEvent) => event.preventDefault(),
              click: () => setTextAlignment(editor, 'center'),
            },
          },
          'Centre paragraph',
        ),
        gitlabRendered
          ? h(
              'button',
              {
                attrs: { type: 'button', disabled: !this.editable },
                on: {
                  mousedown: (event: MouseEvent) => event.preventDefault(),
                  click: () => insertInlineMath(editor, 'x^2'),
                },
              },
              'Insert inline math',
            )
          : null,
        h(
          'button',
          {
            attrs: { type: 'button' },
            on: {
              click: () =>
                this.onEditingModeChange(
                  this.isContentEditorActive ? 'markdownField' : 'contentEditor',
                ),
            },
          },
          this.isContentEditorActive ? 'Use Markdown mode' : 'Use rich text mode',
        ),
        h('button', { attrs: { type: 'submit' } }, 'Save current document'),
      ]),
      h('output', { attrs: { 'aria-label': 'View mount count' } }, String(this.ready)),
      this.error ? h('p', { attrs: { role: 'alert' } }, this.error) : null,
      this.serializationError
        ? h('p', { attrs: { role: 'alert' } }, this.serializationError)
        : null,
      this.alert ? h('p', { attrs: { role: 'alert' } }, this.alert.message) : null,
      h('input', {
        ref: 'submissionField',
        attrs: { type: 'hidden', name: 'description' },
        domProps: { value: this.markdown },
      }),
      h('output', { attrs: { 'aria-label': 'Private transport count' } }, String(this.submissions)),
      h('output', { attrs: { 'aria-label': 'Private submitted Markdown' } }, this.submitted),
      h('output', { attrs: { 'aria-label': 'Private retained draft' } }, this.draft),
      this.visible && this.isContentEditorActive
        ? h(Surface, {
            ref: 'contentEditor',
            props: {
              editor,
              editable: this.editable,
              options,
              readSerializedContent: this.readForHandoff,
            },
            on: {
              ready: () => {
                this.ready++;
                this.error = '';
              },
              error: (error: unknown) => {
                this.error = String(error);
              },
            },
          })
        : null,
      !this.isContentEditorActive
        ? h('textarea', {
            attrs: { 'aria-label': 'Current Markdown editor' },
            domProps: { value: this.markdown },
            on: {
              input: (event: Event) => {
                this.markdown = (event.target as HTMLTextAreaElement).value;
              },
            },
          })
        : null,
      h(
        'output',
        { attrs: { 'aria-label': 'Bridge document JSON' } },
        JSON.stringify(editor.getJSON()),
      ),
      h('fieldset', [
        h(
          'legend',
          gitlabRendered
            ? 'Pinned GitLab HTML conversion contract; no live GitLab service'
            : 'Serialized-content lifecycle (ordinary Fountain Markdown, not GitLab dialect verification)',
        ),
        h('textarea', {
          attrs: { 'aria-label': 'Markdown replacement source' },
          domProps: { value: this.markdown },
          on: {
            input: (event: Event) => {
              this.markdown = (event.target as HTMLTextAreaElement).value;
            },
          },
        }),
        h(
          'button',
          {
            attrs: { type: 'button', disabled: this.loading },
            on: { click: () => this.replaceMarkdown(true) },
          },
          'Apply Markdown template',
        ),
        h(
          'button',
          {
            attrs: { type: 'button', disabled: this.loading },
            on: { click: () => this.replaceMarkdown(false) },
          },
          'Load Markdown baseline',
        ),
        h(
          'output',
          { attrs: { 'aria-label': 'Host document change count' } },
          String(this.changes),
        ),
        h('output', { attrs: { 'aria-label': 'Latest host Markdown' } }, this.serialized),
      ]),
    ]);
  },
});
unsubscribe = editor.subscribe(() => {
  app.revision++;
});
unsubscribeChange = content.subscribeChange((change) => {
  app.changes++;
  // An old successful string must never masquerade as the current document.
  app.serialized = change.status === 'ready' ? change.markdown : '';
  app.serializationError = change.status === 'error' ? String(change.error) : '';
  if (change.status === 'ready') app.draft = change.markdown;
});
app.$mount('#app');
const form = document.getElementById('submission-contract') as HTMLFormElement;
const submit = (event: SubmitEvent) => {
  event.preventDefault();
  const snapshot = prepareMarkdownSubmission(form);
  if (!snapshot || !validateMarkdownSubmission(snapshot)) return;
  // Private transport boundary only; no GitLab backend or persistence is substituted.
  app.submitted = String(new FormData(form).get('description') ?? '');
  app.submissions++;
  completeMarkdownSubmission(snapshot);
};
form.addEventListener('submit', submit);
releaseTransport = () => form.removeEventListener('submit', submit);
