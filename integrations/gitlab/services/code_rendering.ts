import { isSafeURL } from 'fountainjs-editor';
import type { DefaultTreeAdapterMap } from 'parse5';
type Element = DefaultTreeAdapterMap['element'];
type RawNode = DefaultTreeAdapterMap['node'];
const attr = (node: Element, name: string): string | undefined => node.attrs.find(item => item.name === name)?.value;
const specialized = new Set(['math', 'suggestion', 'glql']);

/** GitLab's enabled PlantUML renderer carries original UTF-8 source beside its image. */
export function normalizeGitLabDiagrams(elements: readonly Element[]) {
  const handled = new Set<Element>(), issues: { code: string; message: string }[] = [];
  for (const element of elements) {
    if (attr(element, 'data-diagram') !== 'plantuml') continue;
    try {
      const encoded = attr(element, 'data-diagram-src')?.match(/^data:text\/plain;base64,([A-Za-z\d+/]*={0,2})$/u)?.[1];
      const children = element.childNodes.filter(node => !(node.nodeName === '#text' && 'value' in node && !node.value.trim()));
      const image = children.length === 1 && 'tagName' in children[0]! && children[0].tagName === 'img' ? children[0] : undefined;
      if (encoded === undefined || encoded.length % 4 || element.tagName !== 'a' || !isSafeURL(attr(element, 'href'))
        || !element.attrs.every(item => ['class', 'href', 'target', 'rel', 'data-diagram', 'data-diagram-src'].includes(item.name))
        || !image || image.childNodes.length || !isSafeURL(attr(image, 'src'), { allowDataImage: true })
        || attr(image, 'data-src') !== undefined && !isSafeURL(attr(image, 'data-src'))
        || !image.attrs.every(item => ['src', 'data-src', 'decoding', 'class'].includes(item.name))) throw new Error();
      const bytes = atob(encoded);
      if (btoa(bytes) !== encoded) throw new Error();
      const source = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes, character => character.charCodeAt(0)));
      handled.add(element); handled.add(image);
      element.tagName = 'pre'; element.nodeName = 'pre';
      element.attrs = [{ name: 'data-language', value: 'plantuml' }];
      element.childNodes = [{ nodeName: '#text', value: source, parentNode: element }];
    } catch {
      issues.push({ code: 'diagram-source', message: 'The PlantUML renderer must retain an unambiguous UTF-8 source carrier and safe image address before visual editing.' });
    }
  }
  return { handled, issues };
}

/** Strip only GitLab's presentation carriers, retaining every code character. */
export function normalizeGitLabCodeRendering(elements: readonly Element[]): readonly { code: string; message: string }[] {
  const issues: { code: string; message: string }[] = [];
  for (const pre of elements) {
    if (pre.tagName !== 'pre' || attr(pre, 'data-canonical-lang') === undefined) continue;
    const language = attr(pre, 'data-canonical-lang') || 'text';
    if (specialized.has(language.toLowerCase()) || attr(pre, 'data-lang-params')) {
      issues.push({ code: 'specialized-renderer', message: 'This code language or fence parameters require a dedicated source-aware adapter.' });
      continue;
    }
    const allowed = ['data-sourcepos', 'data-canonical-lang', 'class', 'lang', 'v-pre'];
    const code = pre.childNodes.length === 1 && 'tagName' in pre.childNodes[0]! && pre.childNodes[0].tagName === 'code'
      ? pre.childNodes[0] : undefined;
    let valid = Boolean(code && pre.attrs.every(item => allowed.includes(item.name))
      && code.attrs.every(item => item.name === 'class') && /^[A-Za-z0-9_+.#-]{1,80}$/u.test(language));
    let source = '';
    const visit = (node: RawNode): void => {
      if ('value' in node && node.nodeName === '#text') { source += node.value; return; }
      if ('tagName' in node && node.tagName === 'span' && node.attrs.every(item => ['class', 'id', 'lang', 'data-lang'].includes(item.name))) {
        node.childNodes.forEach(visit); return;
      }
      valid = false;
    };
    code?.childNodes.forEach(visit);
    if (!valid) {
      issues.push({ code: 'code-rendering', message: 'The code rendering has ambiguous structure or metadata; retain source editing.' });
      continue;
    }
    pre.attrs = [{ name: 'data-language', value: language }];
    pre.childNodes = [{ nodeName: '#text', value: source, parentNode: pre }];
    const wrapper = pre.parentNode;
    if (wrapper && 'tagName' in wrapper && wrapper.tagName === 'div' && wrapper.parentNode
      && wrapper.attrs.every(item => item.name === 'class')
      && (attr(wrapper, 'class') ?? '').split(/\s+/u).includes('js-markdown-code')
      && (attr(wrapper, 'class') ?? '').split(/\s+/u).every(name => ['gl-relative', 'markdown-code-block', 'js-markdown-code'].includes(name))
      && wrapper.childNodes.every(node => node === pre || node.nodeName === '#text' && 'value' in node && !node.value.trim()
        || 'tagName' in node && ['copy-code', 'insert-code-snippet'].includes(node.tagName) && !node.attrs.length && !node.childNodes.length)) {
      const parent = wrapper.parentNode, index = parent.childNodes.indexOf(wrapper);
      parent.childNodes.splice(index, 1, pre); pre.parentNode = parent;
    }
  }
  return issues;
}
