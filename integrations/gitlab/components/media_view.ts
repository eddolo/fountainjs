import { selectNode, type Editor, type Node, type NodeViewLike } from 'fountainjs-editor';

/** Native playback owns its controls; the separate button selects the document atom. */
export class GitLabPlayableView implements NodeViewLike {
  readonly dom = document.createElement('span');
  private readonly media: HTMLMediaElement;
  private readonly select = document.createElement('button');
  private current: Node;
  constructor(node: Node, private readonly view: unknown, private readonly getPath: () => number[], label: string) {
    this.current = node;
    this.media = document.createElement(node.attrs.kind === 'audio' ? 'audio' : 'video');
    this.dom.className = `media-container ${String(node.attrs.kind)}-container gl-inline-block gl-max-w-full`;
    this.dom.contentEditable = 'false';
    this.media.controls = true; this.media.preload = 'metadata';
    this.media.style.maxWidth = '100%';
    this.select.type = 'button'; this.select.textContent = label;
    this.select.className = 'gl-block gl-rounded-base gl-border gl-bg-default gl-px-3 gl-py-2 gl-text-sm';
    this.select.addEventListener('click', this.selectMedia);
    this.dom.append(this.media, this.select); this.render();
  }
  private selectMedia = (): void => {
    const editor = (this.view as { editor?: Editor })?.editor;
    if (editor && !editor.isDestroyed) selectNode(editor, this.getPath());
  };
  private render(): void {
    const { attrs } = this.current;
    this.dom.dataset.fountainGitlabMedia = String(attrs.kind);
    if (this.media.getAttribute('src') !== attrs.src) this.media.setAttribute('src', String(attrs.src));
    for (const dimension of ['width', 'height'] as const) {
      if (attrs[dimension] === 'auto') this.media.style.removeProperty(dimension);
      else this.media.style[dimension] = String(attrs[dimension]);
    }
    if (attrs.alt) this.media.setAttribute('aria-label', String(attrs.alt)); else this.media.removeAttribute('aria-label');
    this.media.title = String(attrs.title || attrs.alt || '');
  }
  update(node: Node): boolean {
    if (node.type !== this.current.type || node.attrs.kind !== this.current.attrs.kind) return false;
    this.current = node; this.render(); return true;
  }
  selectNode(): void { this.dom.dataset.fountainMediaSelected = 'true'; }
  deselectNode(): void { delete this.dom.dataset.fountainMediaSelected; }
  stopEvent(event: Event): boolean {
    const target = event.target as globalThis.Node | null;
    return Boolean(target && (this.media.contains(target) || this.select.contains(target)));
  }
  ignoreMutation(): boolean { return true; }
  destroy(): void {
    this.select.removeEventListener('click', this.selectMedia);
    this.media.pause(); this.media.removeAttribute('src'); this.media.load();
  }
}
