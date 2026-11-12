import {
  StarterKit,
  composeExtensions,
  createEditor,
  createMathExtension,
  Plugin,
  type Editor,
  type FountainExtension,
  type MathDocumentRenderer,
} from 'fountainjs-editor';
import { GitLabAssetResolver, type GitLabAssetResolverOptions } from './asset_resolver';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from './markdown_codec';
import {
  SerializedContentController,
  type SerializedContentChange,
  type SerializedContentResult,
} from './serialized_content';
import { createGitLabReferenceNavigationPlugin } from '../plugins/reference_navigation';
import { GitLabMarkdownInsertion } from './markdown_insertion';
import { GitLabAttachmentUploads, type GitLabUploadHandler, type GitLabUploadSnapshot } from './attachment_uploads';
import { GitLabLinkEditingSession, type GitLabLinkSnapshot } from './link_editing';
import { GitLabCodeEditingSession } from './code_editing';
import { GitLabAlertEditing } from './alert_editing';

export type GitLabEditorStatus = 'unloaded' | 'loading' | 'ready' | 'error' | 'destroyed';
export interface GitLabContentEditorOptions extends GitLabAssetResolverOptions {
  editable?: boolean;
  extensions?: readonly FountainExtension[];
  renderMath?: MathDocumentRenderer;
  onListenerError?(error: unknown): void;
  uploadAttachment?: GitLabUploadHandler;
  maxUploadEntries?: number;
}
export class GitLabEditorNotReady extends Error {
  constructor(readonly status: GitLabEditorStatus) {
    super('GITLAB_EDITOR_NOT_READY');
    this.name = 'GitLabEditorNotReady';
  }
}

/** Native document service. GitLab owns network access; Fountain owns its model. */
export class GitLabContentEditor {
  readonly editor: Editor;
  readonly assetResolver: GitLabAssetResolver;
  private readonly controller: SerializedContentController;
  private readonly codec: GitLabMarkdownCodec;
  private readonly insertions: GitLabMarkdownInsertion;
  private readonly uploads: GitLabAttachmentUploads;
  private linkSession?: GitLabLinkEditingSession;
  private codeSession?: GitLabCodeEditingSession;
  readonly alerts: GitLabAlertEditing;
  private readonly uploadListeners = new Set<(uploads: readonly GitLabUploadSnapshot[]) => void>();
  private readonly releaseChanges: () => void;
  private readonly listeners = new Set<(change: SerializedContentChange) => void>();
  private readonly statusListeners = new Set<(status: GitLabEditorStatus) => void>();
  private request = 0;
  private loading = false;
  private loaded = false;
  private destroyed = false;
  private loadFailure = false;
  private exportFailure = false;
  private notifiedStatus: GitLabEditorStatus = 'unloaded';
  private listenerFailure?: unknown;
  private readonly reportListenerError?: (error: unknown) => void;
  private recoveryValue?: Readonly<{ markdown: string; error: unknown }>;

  constructor(options: GitLabContentEditorOptions) {
    const supported = new Set([
      'renderMarkdown',
      'describeLabels',
      'onIssue',
      'maxCacheEntries',
      'maxHTMLBytes',
      'maxCacheBytes',
      'editable',
      'extensions',
      'renderMath',
      'onListenerError',
      'uploadAttachment',
      'maxUploadEntries',
    ]);
    for (const key of Object.keys(options)) {
      if (!supported.has(key)) throw new TypeError(`UNSUPPORTED_GITLAB_NATIVE_OPTION:${key}`);
    }
    if (options.uploadAttachment !== undefined && typeof options.uploadAttachment !== 'function')
      throw new TypeError('EXPECTED_GITLAB_UPLOAD_HANDLER');
    if (options.maxUploadEntries !== undefined && (!Number.isInteger(options.maxUploadEntries)
      || options.maxUploadEntries < 1 || options.maxUploadEntries > 1000))
      throw new RangeError('INVALID_GITLAB_UPLOAD_CAPACITY');
    for (const extension of options.extensions ?? []) {
      if ('config' in extension) throw new TypeError('EXPECTED_NATIVE_FOUNTAIN_EXTENSION');
    }
    this.reportListenerError = options.onListenerError;
    const math = createMathExtension({
      inputRules: false,
      pasteRules: false,
      documentRenderer: options.renderMath
        ? (source, context) =>
            options.renderMath!(source, {
              ...context,
              displayMode: context.displayMode || context.node.attrs.gitlabMathSyntax === 'display',
            })
        : undefined,
    });
    const kit = composeExtensions([...StarterKit.extensions, math, ...(options.extensions ?? [])]);
    this.assetResolver = new GitLabAssetResolver(options);
    let alertInput: Plugin | undefined;
    try {
      this.editor = createEditor({
        schema: createGitLabSchemaSpec(kit.schema),
        plugins: [new Plugin({ props: {
          handleKeyDown: (editor, event) => alertInput?.spec.props?.handleKeyDown?.(editor, event) ?? false,
          handleBeforeInput: (editor, event) => alertInput?.spec.props?.handleBeforeInput?.(editor, event) ?? false,
          handlePaste: (editor, event) => alertInput?.spec.props?.handlePaste?.(editor, event) ?? false,
        } }), ...kit.plugins, createGitLabReferenceNavigationPlugin()],
        editable: options.editable,
      });
    } catch (error) {
      this.assetResolver.dispose();
      throw error;
    }
    const codec = this.codec = new GitLabMarkdownCodec(options);
    this.controller = new SerializedContentController(this.editor, codec);
    this.alerts = new GitLabAlertEditing({ editor: this.editor,
      ensureReady: () => {
        this.assertAlive();
        if (!this.loaded || this.loading || this.loadFailure || this.exportFailure || !this.editable)
          throw new GitLabEditorNotReady(this.status);
      },
      validate: doc => { this.codec.serialize({ doc }); },
      onError: error => {
        this.listenerFailure = error;
        try { this.reportListenerError?.(error); } catch { /* Host error observers cannot change input ownership. */ }
      },
    });
    alertInput = this.alerts.plugin();
    this.insertions = new GitLabMarkdownInsertion(
      this.editor,
      codec,
      () => {
        this.assertAlive();
        if (
          this.loading ||
          this.loadFailure ||
          this.exportFailure ||
          !this.loaded ||
          !this.editable
        )
          throw new GitLabEditorNotReady(this.status);
      },
      () => this.notifyStatus(),
    );
    this.uploads = new GitLabAttachmentUploads(this.insertions, options.uploadAttachment,
      uploads => { this.notifyStatus(); this.notify(this.uploadListeners, uploads); }, options.maxUploadEntries);
    this.releaseChanges = this.controller.subscribeChange((change) => {
      if (this.destroyed) return;
      this.exportFailure = change.status === 'error';
      this.notifyStatus();
      const current: SerializedContentChange =
        this.loading || this.loadFailure || this.uploads.hasFailures || !this.loaded
          ? { status: 'error', error: new GitLabEditorNotReady(this.status) }
          : change;
      this.notify(this.listeners, current);
    });
  }

  get status(): GitLabEditorStatus {
    if (this.destroyed) return 'destroyed';
    if (this.loading || this.insertions.pendingCount > 0) return 'loading';
    if (this.loadFailure || this.exportFailure || this.uploads.hasFailures) return 'error';
    return this.loaded ? 'ready' : 'unloaded';
  }
  /** Failed source remains available even after deliberately keeping the visible document. */
  get recovery(): Readonly<{ markdown: string; error: unknown }> | undefined {
    return this.recoveryValue;
  }
  get editable(): boolean {
    return this.editor.editable;
  }
  get listenerError(): unknown {
    return this.listenerFailure;
  }
  get pendingInsertions(): number {
    return this.insertions.pendingCount;
  }
  get insertionRecovery(): Readonly<{ markdown: string; error: unknown }> | undefined {
    return this.insertions.recovery;
  }
  pasteMarkdown(markdown: string): Promise<SerializedContentResult> {
    return this.insertions.insert(markdown);
  }
  get attachmentUploads(): readonly GitLabUploadSnapshot[] { return this.uploads.snapshots; }
  get availableUploadSlots(): number { return this.uploads.availableSlots; }
  uploadAttachment(file: File): Promise<SerializedContentResult> { return this.uploads.add(file); }
  retryUpload(id: string): Promise<SerializedContentResult> { return this.uploads.retry(id); }
  beginCodeEdit(): GitLabCodeEditingSession {
    this.codeSession?.close();
    const session = new GitLabCodeEditingSession({ editor: this.editor,
      ensureReady: () => {
        this.assertAlive();
        if (!this.loaded || this.loading || this.loadFailure || this.exportFailure || !this.editable)
          throw new GitLabEditorNotReady(this.status);
      },
      validate: doc => { this.codec.serialize({ doc }); },
      closed: () => { if (this.codeSession === session) this.codeSession = undefined; },
      onListenerError: error => {
        this.listenerFailure = error;
        this.reportListenerError?.(error);
      },
    });
    this.codeSession = session;
    return session;
  }
  beginLinkEdit(changed?: (snapshot: GitLabLinkSnapshot) => void): GitLabLinkEditingSession {
    this.linkSession?.close();
    const session = new GitLabLinkEditingSession({ editor: this.editor,
      ensureReady: () => {
        this.assertAlive();
        if (!this.loaded || this.loading || this.loadFailure || this.exportFailure || !this.editable)
          throw new GitLabEditorNotReady(this.status);
      },
      resolveURL: async (href, signal) => {
        const { schema } = this.editor.state;
        const document = schema.node('doc', {}, [schema.node('paragraph', {}, [
          schema.text('link', [schema.mark('link', { href })]),
        ])]);
        const markdown = this.codec.serialize({ doc: document });
        const result = await this.codec.deserialize({ schema, markdown, signal });
        let resolved: string | undefined;
        result.document.descendants(node => {
          if (!node.isText || !node.text) return;
          const link = node.marks.find(mark => mark.type.name === 'link');
          if (!link || resolved !== undefined && resolved !== link.attrs.href)
            throw new Error('GITLAB_LINK_RESOLUTION_FAILED');
          resolved = String(link.attrs.href);
        });
        if (!resolved || result.document.textContent !== 'link') throw new Error('GITLAB_LINK_RESOLUTION_FAILED');
        return resolved;
      },
      validate: doc => { this.codec.serialize({ doc }); },
      changed, closed: () => { if (this.linkSession === session) this.linkSession = undefined; },
      onListenerError: error => {
        this.listenerFailure = error;
        this.reportListenerError?.(error);
      },
    });
    this.linkSession = session;
    return session;
  }
  cancelUpload(id: string): boolean {
    const removed = this.uploads.cancel(id);
    if (removed && !this.uploads.hasFailures && !this.pendingInsertions && !this.loading
      && !this.loadFailure && this.loaded) {
      try { this.notify(this.listeners, { status: 'ready', markdown: this.getSerializedContent() }); }
      catch (error) { this.notify(this.listeners, { status: 'error', error }); }
    }
    return removed;
  }
  subscribeUploads(listener: (uploads: readonly GitLabUploadSnapshot[]) => void): () => void {
    this.assertAlive();
    this.uploadListeners.add(listener);
    return () => { this.uploadListeners.delete(listener); };
  }

  getSerializedContent(): string {
    this.assertAlive();
    if (this.loading || this.pendingInsertions > 0 || this.uploads.hasFailures || this.loadFailure || !this.loaded)
      throw new GitLabEditorNotReady(this.status);
    try {
      const markdown = this.controller.getSerializedContent();
      this.exportFailure = false;
      return markdown;
    } catch (error) {
      this.exportFailure = true;
      throw error;
    } finally {
      this.notifyStatus();
    }
  }

  async setSerializedContent(
    markdown: string,
    options: { addToHistory?: boolean } = {},
  ): Promise<SerializedContentResult> {
    this.assertAlive();
    if (typeof markdown !== 'string') throw new TypeError('EXPECTED_MARKDOWN_STRING');
    const request = ++this.request;
    this.loading = true;
    this.insertions.cancel();
    this.notifyStatus();
    try {
      const result = await this.controller.setSerializedContent(markdown, options);
      if (request !== this.request || this.destroyed) return { status: 'superseded' };
      if (result.status === 'applied') {
        this.loaded = true;
        this.loadFailure = false;
        this.exportFailure = false;
        this.recoveryValue = undefined;
      }
      return result;
    } catch (error) {
      if (request === this.request && !this.destroyed) {
        this.loadFailure = true;
        this.recoveryValue = Object.freeze({ markdown, error });
      }
      throw error;
    } finally {
      if (request === this.request && !this.destroyed) {
        this.loading = false;
        this.notifyStatus();
      }
    }
  }

  /** Explicit recovery action; never silently substitute an older document for failed input. */
  keepCurrentDocument(): string {
    this.assertAlive();
    if (this.loading || !this.loadFailure) throw new GitLabEditorNotReady(this.status);
    const markdown = this.controller.getSerializedContent();
    this.loaded = true;
    this.loadFailure = false;
    this.exportFailure = false;
    this.notifyStatus();
    this.notify(this.listeners, { status: 'ready', markdown });
    return markdown;
  }

  setEditable(editable = true): boolean {
    this.assertAlive();
    return this.editor.setEditable(editable);
  }
  subscribeChange(listener: (change: SerializedContentChange) => void): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  subscribeStatus(listener: (status: GitLabEditorStatus) => void): () => void {
    this.assertAlive();
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
  resolveUrl(source: string): Promise<string> {
    this.assertAlive();
    return this.assetResolver.resolveUrl(source);
  }
  resolveIframeSrc(source: string): ReturnType<GitLabAssetResolver['resolveIframeSrc']> {
    this.assertAlive();
    return this.assetResolver.resolveIframeSrc(source);
  }
  resolveReference(source: string): ReturnType<GitLabAssetResolver['resolveReference']> {
    this.assertAlive();
    return this.assetResolver.resolveReference(source);
  }
  renderDiagram(source: string, language?: string): Promise<string> {
    this.assertAlive();
    return this.assetResolver.renderDiagram(source, language);
  }
  explainQuickAction(source: string): Promise<string> {
    this.assertAlive();
    return this.assetResolver.explainQuickAction(source);
  }
  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.request++;
    this.linkSession?.close();
    this.linkSession = undefined;
    this.codeSession?.close();
    this.codeSession = undefined;
    this.insertions.dispose();
    this.uploads.dispose();
    this.uploadListeners.clear();
    this.releaseChanges();
    this.controller.dispose();
    this.assetResolver.dispose();
    this.editor.destroy();
    this.listeners.clear();
    this.notifyStatus();
    this.statusListeners.clear();
    this.recoveryValue = undefined;
    this.listenerFailure = undefined;
  }
  private notifyStatus(): void {
    const status = this.status;
    if (status === this.notifiedStatus) return;
    this.notifiedStatus = status;
    this.notify(this.statusListeners, status);
  }
  private notify<T>(listeners: Set<(value: T) => void>, value: T): void {
    for (const listener of listeners) {
      try {
        listener(value);
      } catch (error) {
        this.listenerFailure = error;
        try {
          this.reportListenerError?.(error);
        } catch {
          /* A reporter cannot interrupt model/view updates. */
        }
      }
    }
  }
  private assertAlive(): void {
    if (this.destroyed) throw new GitLabEditorNotReady('destroyed');
  }
}
