import { insertDocument, MarkdownSourceSnapshot, NodeSelection, Selection, type Schema, type Editor, type EditorView, type Node, type NodeSpec, type NodeViewLike } from 'fountainjs-editor';
import { buildTableOfContents, type TableOfContentsTreeEntry } from 'fountainjs-editor/table-of-contents';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { GitLabFootnotePositions } from './footnote_positions';

type Element = DefaultTreeAdapterMap['element'];
const attribute = (element: Element, name: string) => element.attrs.find(item => item.name === name)?.value;
const valid = (value: unknown): value is string => typeof value === 'string' && /^(?:\[toc\]|\[\[_toc_\]\])$/iu.test(value);
const tag = 'fountain-gitlab-toc';

/**
 * A reader preview can collapse several directives into one navigation list or
 * omit them entirely. Only restore whole source blocks between verified peers.
 */
export function restoreGitLabReaderContents(fragment: DefaultTreeAdapterMap['documentFragment'], source: string, schema: Schema, maxBytes: number) {
  const possible = /^ {0,3}(?:\[toc\]|\[\[_toc_\]\]|\\\[toc\\\])[ \t]*\r?$/gimu;
  const first = possible.exec(source);
  if (!first) return;
  const positions = new GitLabFootnotePositions(source, maxBytes);
  const children = fragment.childNodes.filter(node => !('value' in node && !node.value.trim()));
  const nav = (node: typeof children[number]) => 'tagName' in node && node.tagName === 'ul'
    && attribute(node, 'class') === 'section-nav' && !attribute(node, 'data-sourcepos');
  const ordinary = children.filter(node => !nav(node));
  const spans = ordinary.map(node => {
    if (!('tagName' in node)) return undefined;
    const carrier = node.tagName === 'div' && attribute(node, 'class')?.split(/\s+/u).includes('js-markdown-code')
      ? node.childNodes.find(child => 'tagName' in child && child.tagName === 'pre') : node;
    return carrier && 'tagName' in carrier ? positions.read(attribute(carrier, 'data-sourcepos') ?? '') : undefined;
  });
  // The normal editor response already accounts for directives and code examples.
  if (ordinary.length === children.length) {
    let index = 0, match: RegExpExecArray | null = first;
    while (match) {
      while (index < spans.length && (!spans[index] || spans[index]!.to <= match.index)) index++;
      const span = spans[index];
      if (!span || span.from > match.index + match[0].search(/\S/u) || span.to < match.index + match[0].trimEnd().length) break;
      match = possible.exec(source);
    }
    if (!match) return;
  }

  const { source: snapshot, document } = MarkdownSourceSnapshot.parse(source, schema);
  const marker = (block: string) => /^ {0,3}(\[toc\]|\[\[_toc_\]\]|\\\[toc\\\])[ \t]*$/iu.exec(block)?.[1];
  const fail = () => { throw new Error('GitLab reader blocks do not match the original table-of-contents source.'); };
  if (!snapshot.blocks.length) fail();
  if (!snapshot.blocks.some(block => marker(block.source))) return;
  if (snapshot.body !== source || snapshot.leading.trim() || snapshot.blocks.length !== document.childCount) fail();
  let offset = snapshot.leading.length, line = 1 + (snapshot.leading.match(/\r\n?|\n/gu)?.length ?? 0);
  let next = 0, cursor = 0, restored = 0;
  const rebuilt: typeof children = [];
  for (const [index, block] of snapshot.blocks.entries()) {
    if (block.separatorAfter.trim()) fail();
    const end = offset + block.source.length, span = spans[next];
    const node = ordinary[next];
    // GitLab drops both the marker attribute and sourcepos when sanitizing an
    // intentional empty paragraph written by the Markdown exporter.
    const emptyParagraph = block.source === '<p data-fountain-empty="text"></p>' && node && 'tagName' in node
      && node.tagName === 'p' && !node.childNodes.length && node.attrs.every(a => a.name === 'dir' && a.value === 'auto');
    if (node && node === children[cursor] && ((span?.from === offset && span.to === end) || emptyParagraph)) {
      next++;
      if ('tagName' in node && /^h[1-6]$/u.test(node.tagName)) {
        const anchor = node.childNodes.at(-1);
        const target = attribute(node, 'id')?.match(/^user-content-(.+)$/u)?.[1];
        // GitLab appends an empty self-link after the author's heading content.
        if (target && anchor && 'tagName' in anchor && anchor.tagName === 'a' && !anchor.childNodes.length
          && attribute(anchor, 'class') === 'anchor' && attribute(anchor, 'data-heading-content') !== undefined
          && attribute(anchor, 'href') === '#' + target && !/<a[\s>]/iu.test(block.source)) node.childNodes.pop();
      }
      rebuilt.push(node);
      cursor++;
    } else {
      const token = marker(block.source);
      const paragraphNode = document.child(index);
      if (!token || paragraphNode.type.name !== 'paragraph' || paragraphNode.content.some(node => node.marks.some(mark => mark.type.name === 'link'))) return fail();
      if (children[cursor] && nav(children[cursor]!)) cursor++;
      // Only bracketed ASCII tokens reach here. Feed the ordinary importer the
      // same paragraph and inclusive source position as the editing preview.
      const column = block.source.indexOf(token) + 1;
      const value = token.replaceAll('\\', '');
      const paragraph = parseFragment('<p dir="auto" data-sourcepos="' + line + ':' + column + '-' + line + ':' + (column + token.length - 1) + '">' + value + '</p>').childNodes[0]!;
      paragraph.parentNode = fragment;
      rebuilt.push(paragraph);
      restored++;
    }
    const consumed = block.source + block.separatorAfter;
    offset += consumed.length;
    line += consumed.match(/\r\n?|\n/gu)?.length ?? 0;
  }
  if (offset !== source.length || cursor !== children.length || next !== ordinary.length) fail();
  if (!restored) return false;
  fragment.childNodes = rebuilt;
  return true;
}

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

export function insertGitLabContents(editor: Editor): boolean {
  const { schema } = editor.state;
  const outline = schema.node('gitlab_table_of_contents');
  return editor.runCommandBatch(() => insertDocument(editor, schema.topNodeType.create({}, [outline])));
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
