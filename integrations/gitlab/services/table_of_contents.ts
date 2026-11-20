import { NodeSelection, Selection, type EditorView, type Node, type NodeSpec, type NodeViewLike } from 'fountainjs-editor';
import { buildTableOfContents, type TableOfContentsTreeEntry } from 'fountainjs-editor/table-of-contents';
import type { DefaultTreeAdapterMap } from 'parse5';
import { GitLabFootnotePositions } from './footnote_positions';

type Element = DefaultTreeAdapterMap['element'];
const attribute = (element: Element, name: string) => element.attrs.find(item => item.name === name)?.value;
const valid = (value: unknown): value is string => typeof value === 'string' && /^(?:\[toc\]|\[\[_toc_\]\])$/iu.test(value);
const tag = 'fountain-gitlab-toc';

export function normalizeGitLabContents(elements: readonly Element[], source: string, maxBytes: number, enabled: boolean) {
  let positions: GitLabFootnotePositions | undefined;
  for (const element of elements) {
    if (element.tagName === tag) throw new Error('Unexpected table-of-contents marker in host HTML.');
    if (!enabled || element.tagName !== 'p' || element.childNodes.length !== 1) continue;
    const child = element.childNodes[0]!;
    const wiki = 'tagName' in child && child.tagName === 'a' && attribute(child, 'data-wikilink') === 'true';
    const text = wiki && child.childNodes.length === 1 ? child.childNodes[0]! : child;
    if (!('value' in text)) continue;
    const token = wiki ? '[[' + text.value + ']]' : text.value.trim();
    if (!valid(token)) continue;
    positions ??= new GitLabFootnotePositions(source, maxBytes);
    const span = positions.read(attribute(element, 'data-sourcepos') ?? '');
    if (!span) throw new Error('Missing source position for GitLab table of contents.');
    if (source.slice(span.from, span.to).trim() !== token) continue;
    element.tagName = element.nodeName = tag;
    element.attrs = [{ name: 'token', value: token }];
    element.childNodes = [];
  }
}

export function gitLabContentsNode(label: string): NodeSpec {
  return {
    group: 'block', atom: true,
    attrs: { token: { default: '[[_TOC_]]', validate: valid } },
    parseHTML: [{ tag, getAttrs: element => ({ token: element.getAttribute('token') }) }],
    toText: node => String(node.attrs.token),
    toDOM: () => ['div', { class: 'table-of-contents' }, label],
    nodeView: class implements NodeViewLike {
      readonly dom: HTMLElement;
      private readonly release: () => void;
      constructor(_node: Node, viewValue: unknown) {
        const view = viewValue as EditorView;
        const owner = view.mount.ownerDocument;
        this.dom = owner.createElement('nav');
        this.dom.contentEditable = 'false';
        this.dom.className = 'table-of-contents gl-border gl-rounded-base gl-p-4 gl-mb-4';
        this.dom.setAttribute('aria-label', label);
        const title = owner.createElement('strong'), outline = owner.createElement('div');
        title.textContent = label;
        this.dom.append(title, outline);
        const list = (items: readonly TableOfContentsTreeEntry[]) => {
          const ul = owner.createElement('ul');
          for (const entry of items) {
            const li = owner.createElement('li'), button = owner.createElement('button');
            button.type = 'button';
            button.className = 'gl-button-text gl-text-link gl-border-0 gl-bg-transparent gl-p-0';
            button.textContent = entry.title;
            button.onclick = () => {
              const editor = view.editor;
              const doc = editor.state.doc;
              const heading = entry.path.reduce((node, index) => node.child(index), doc);
              const firstText = heading.content.findIndex(child => child.isText);
              const selection = firstText < 0 ? new NodeSelection(doc, entry.path) : Selection.cursor([...entry.path, firstText], 0);
              editor.dispatch(editor.createTransaction().setSelection(selection).setMeta('addToHistory', false));
              view.focus();
              view.scrollSelectionIntoView();
            };
            li.append(button);
            if (entry.children.length) li.append(list(entry.children));
            ul.append(li);
          }
          return ul;
        };
        let previous: Node | undefined, signature = '';
        const render = (doc: Node) => {
          if (doc === previous) return;
          previous = doc;
          const { tree, entries } = buildTableOfContents(doc);
          const next = JSON.stringify(entries.map(entry => [entry.path, entry.level, entry.title]));
          if (signature === next) return;
          signature = next;
          outline.replaceChildren(...(tree.length ? [list(tree)] : []));
        };
        render(view.editor.state.doc);
        this.release = view.editor.subscribe(state => render(state.doc));
      }
      stopEvent(event: Event): boolean { return Boolean((event.target as globalThis.Element | null)?.closest?.('button')); }
      ignoreMutation(): boolean { return true; }
      destroy(): void { this.release(); }
    },
  };
}
