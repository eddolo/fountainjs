import {
  ChangeDetectionStrategy, Component, computed, createComponent, effect,
  input, signal, provideZonelessChangeDetection, DestroyRef, inject, untracked,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import {
  StarterKit, Plugin, HTMLExporter, MarkdownExporter, canUndo, canRedo, undo, redo,
  toggleMark, toggleQuote, isMarkActive, isInsideNode, selectAll, insertList,
  getActiveMedia, setMediaAttributes, deleteMedia, setMark, unsetMark, setTextAlignment,
  startImageUpload, type ImageUploadTask,
  type Editor, type NodeJSON, type EditorViewOptions,
} from 'fountainjs-editor';
import { createFountain, fountainState, FountainEditorDirective } from 'fountainjs-editor/angular';

/** A local adapter keeps the actual chosen bytes, not a substitute stock asset. */
function readLocalFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) { reject(new Error('This local demo accepts files up to 10 MiB.')); return; }
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    reader.onload = () => { cleanup(); resolve(String(reader.result)); };
    reader.onerror = () => { cleanup(); reject(reader.error ?? new Error('Could not read file')); };
    reader.onabort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    reader.readAsDataURL(file);
  });
}

@Component({
  selector: 'fountain-angular-campaign-editor', standalone: true,
  imports: [FountainEditorDirective], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campaign-editor.html',
})
export class CampaignEditor {
  private readonly owner = inject(DestroyRef);
  private readonly pending = new Set<ImageUploadTask>();
  readonly content = input.required<NodeJSON>();
  readonly lifecycle = input.required<(event: 'created' | 'destroyed') => void>();
  readonly editor = createFountain(() => ({
    schema: StarterKit.schema, content: this.content(),
    plugins: [...StarterKit.plugins, new Plugin({ props: {
      onCreate: () => this.lifecycle()('created'), onDestroy: () => this.lifecycle()('destroyed'),
    } })],
  }));
  readonly snapshot = fountainState(this.editor);
  readonly visible = signal(true);
  readonly format = signal<'json' | 'markdown' | 'html'>('json');
  readonly highlight = signal('#fff2a8');
  readonly mediaTitle = signal('');
  readonly mediaDescription = signal('');
  readonly status = signal('PNG/JPEG/GIF/WebP images can be embedded locally (up to 10 MiB). Audio/video/file uploads require your storage adapter.');
  readonly options: EditorViewOptions = {
    ariaLabel: 'Angular campaign editor', placeholder: 'Write the campaign story…',
    imageUpload: async (file, { signal, reportProgress }) => {
      if (!/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) throw new Error('Local embedding supports PNG, JPEG, GIF and WebP. Other files need a host URL.');
      this.status.set(`Reading ${file.name} locally…`); reportProgress(.25);
      const src = await readLocalFile(file, signal); reportProgress(1);
      this.status.set(`Added ${file.name} locally.`);
      return { src, alt: file.name, caption: 'Local image; embedded in the document.' };
    },
    assetUpload: async () => {
      const message = 'Audio/video/file uploads need a host adapter returning a persistent URL. This demo will not substitute a stock file for your chosen file.';
      this.status.set(message); throw new Error(message);
    },
    onError: error => this.status.set(String(error)),
  };
  readonly commands: { label: string; run: (editor: Editor) => unknown; enabled?: (editor: Editor) => boolean; pressed?: (editor: Editor) => boolean }[] = [
    { label: 'Undo', run: undo, enabled: canUndo }, { label: 'Redo', run: redo, enabled: canRedo },
    { label: 'Bold', run: editor => toggleMark(editor, 'strong'), pressed: editor => isMarkActive(editor, 'strong') },
    { label: 'Quote', run: toggleQuote, pressed: editor => isInsideNode(editor, 'blockquote') },
    { label: 'Centre', run: editor => setTextAlignment(editor, 'center') },
    { label: 'Select all', run: selectAll }, { label: '+ Task', run: editor => insertList(editor, 'task', ['Review the campaign']) },
  ];
  readonly buttons = computed(() => {
    this.snapshot(); const editor = this.editor();
    return this.commands.map(command => ({ ...command,
      disabled: !editor || !this.visible() || Boolean(command.enabled && !command.enabled(editor)),
      pressed: editor && command.pressed ? command.pressed(editor) : null,
    }));
  });
  readonly activeMedia = computed(() => { this.snapshot(); const editor = this.editor(); return editor && getActiveMedia(editor); });
  private readonly mediaSignature = computed(() => {
    const selected = this.activeMedia();
    return selected ? JSON.stringify([selected.path, selected.node.attrs.name, selected.node.attrs.title,
      selected.node.attrs.description, selected.node.attrs.caption]) : '';
  });
  readonly document = computed(() => this.snapshot()?.doc);
  readonly output = computed(() => {
    const doc = this.document();
    return !doc ? '' : this.format() === 'json' ? JSON.stringify(doc.toJSON(), null, 2)
      : this.format() === 'markdown' ? MarkdownExporter.export(doc) : HTMLExporter.export(doc);
  });
  readonly formats = ['json', 'markdown', 'html'] as const;
  readonly deleteMedia = deleteMedia;
  constructor() {
    this.owner.onDestroy(() => { for (const task of this.pending) task.cancel(); this.pending.clear(); });
    effect(() => {
      this.mediaSignature();
      untracked(() => {
        const selected = this.activeMedia();
        this.mediaTitle.set(String(selected?.node.attrs.name ?? selected?.node.attrs.title ?? ''));
        this.mediaDescription.set(String(selected?.node.attrs.description ?? selected?.node.attrs.caption ?? ''));
      });
    });
  }
  run(command: (editor: Editor) => unknown): void { const editor = this.editor(); if (editor) command(editor); }
  keepSelection(event: MouseEvent): void { event.preventDefault(); }
  value(event: Event): string { return (event.target as HTMLInputElement).value; }
  applyHighlight(): void { this.run(editor => setMark(editor, 'highlight', { color: this.highlight() })); }
  removeHighlight(): void { this.run(editor => unsetMark(editor, 'highlight')); }
  async addFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []); input.value = '';
    const editor = this.editor(); if (!editor) return;
    for (const file of files) {
      if (this.owner.destroyed) return;
      const task = startImageUpload(editor, file, { upload: this.options.imageUpload });
      this.pending.add(task);
      try { await task.completion; }
      catch (error) { task.cancel(); if (!this.owner.destroyed) this.status.set(`${file.name}: ${String(error)}`); }
      finally { this.pending.delete(task); }
    }
  }
  updateMedia(): void {
    const selected = this.activeMedia(); if (!selected) return;
    this.run(editor => setMediaAttributes(editor, selected.node.type.name === 'file_attachment'
      ? { name: this.mediaTitle(), description: this.mediaDescription() }
      : { title: this.mediaTitle(), caption: this.mediaDescription() }));
  }
}

@Component({
  selector: 'fountain-angular-campaign', standalone: true, imports: [CampaignEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="angular-campaign-demo">
    <div class="demo-controls">
      <button type="button" (click)="session.set(session() + 1)">Reset campaign (discards edits)</button>
      <span aria-label="Editor lifecycle">Created: {{created()}} · Destroyed: {{destroyed()}}</span>
      <span>Angular owns this session. Hiding the view retains edits; reset starts again.</span>
    </div>
    @for (entry of sessions(); track entry.id) {
      <fountain-angular-campaign-editor [content]="content()" [lifecycle]="lifecycle" />
    }
  </div>`,
})
export class AngularCampaign {
  readonly content = input.required<NodeJSON>();
  readonly session = signal(0);
  readonly sessions = computed(() => [{ id: this.session() }]);
  readonly created = signal(0);
  readonly destroyed = signal(0);
  readonly lifecycle = (event: 'created' | 'destroyed') => {
    if (event === 'created') this.created.update(value => value + 1);
    else this.destroyed.update(value => value + 1);
  };
}

export async function mountAngularCampaign(target: HTMLElement, content: NodeJSON): Promise<() => void> {
  const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
  let component: ReturnType<typeof createComponent<AngularCampaign>> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    try { component?.destroy(); } finally { app.destroy(); }
  };
  try {
    component = createComponent(AngularCampaign, { hostElement: target, environmentInjector: app.injector });
    component.setInput('content', content); app.attachView(component.hostView);
    component.changeDetectorRef.detectChanges();
    await app.whenStable();
    return dispose;
  } catch (error) { dispose(); throw error; }
}
