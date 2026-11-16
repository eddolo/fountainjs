import { Plugin, type Node, type NodeSpec } from 'fountainjs-editor';
import type { DefaultTreeAdapterMap } from 'parse5';
import { readGitLabSuggestionSource, serializeGitLabSuggestionSource, gitLabSuggestionDeletesLines } from './code_suggestion_source';
import { replaceGitLabCodeRendering } from './code_rendering';

type Element = DefaultTreeAdapterMap['element'];
const attribute = 'data-fountain-gitlab-suggestion';
const validParams = (value: unknown): boolean => typeof value === 'string' && (value === '' || /^[+-]\d{1,9}[+-]\d{1,9}$/u.test(value));
const validFence = (value: unknown): boolean => typeof value === 'string' && /^(?:`{3,1024}|~{3,1024})$/u.test(value);
export function gitLabCodeSuggestion(): NodeSpec {
  return { group: 'block', content: 'text*', code: true, selectable: true, paragraphFlow: 'text',
    attrs: { params: { default: '', validate: validParams }, fence: { default: '```', validate: validFence } },
    validate: node => node.content.every(child => child.isText && !child.marks.length)
      && node.textContent.length <= 1_048_576 && !/\r/u.test(node.textContent),
    parseHTML: [{ tag: `pre[${attribute}]`, priority: 350, contentElement: 'code', getAttrs: element => {
      const params = element.getAttribute(attribute), fence = element.getAttribute('data-fountain-suggestion-fence') ?? '```';
      return validParams(params) && validFence(fence) ? { params, fence } : false;
    } }],
    toDOM: node => ['pre', { [attribute]: node.attrs.params, 'data-fountain-suggestion-fence': node.attrs.fence,
      'data-fountain-suggestion-effect': gitLabSuggestionDeletesLines(node.textContent) ? 'deletion' : 'replacement',
      tabindex: 0, role: 'region', 'aria-label': 'Suggested replacement', 'data-language': 'suggestion' }, ['span', { contenteditable: 'false', style: 'display:block;font:600 12px system-ui;margin-bottom:10px' },
      'Suggested replacement' + (gitLabSuggestionDeletesLines(node.textContent) ? ' · Deletes target lines' : '') + (node.attrs.params ? ` · ${String(node.attrs.params)}` : '')], ['code', 0]],
  };
}
export function serializeGitLabSuggestionNode(node: Node): string {
  if (node.type.name !== 'gitlab_code_suggestion' || !validParams(node.attrs.params) || !validFence(node.attrs.fence)
    || !node.type.spec.validate?.(node)) throw new Error('GITLAB_SUGGESTION_NODE_INVALID');
  return serializeGitLabSuggestionSource({ text: node.textContent, params: String(node.attrs.params), fence: String(node.attrs.fence) });
}
export function normalizeGitLabSuggestionNodes(elements: readonly Element[], source: string) {
  const handled = new Set<Element>(), issues: { code: string; message: string }[] = [];
  for (const pre of elements) {
    if (pre.tagName !== 'pre' || !pre.attrs.some(attr => attr.name === 'data-canonical-lang' && attr.value === 'suggestion')) continue;
    try {
      const suggestion = readGitLabSuggestionSource(pre, source);
      replaceGitLabCodeRendering(pre, [{ name: attribute, value: suggestion.params },
        { name: 'data-fountain-suggestion-fence', value: suggestion.fence }], suggestion.text);
      const code: Element = { nodeName: 'code', tagName: 'code', attrs: [], namespaceURI: pre.namespaceURI,
        childNodes: pre.childNodes, parentNode: pre };
      for (const child of code.childNodes) child.parentNode = code;
      pre.childNodes = [code];
      handled.add(pre);
    } catch {
      issues.push({ code: 'suggestion-source', message: 'Suggestion source, range metadata or rendered code is ambiguous; original Markdown is retained.' });
    }
  }
  return { handled, issues };
}

/** Plain-text consumers receive executable suggestion syntax as inert text,
 * including its range header; structured/HTML consumers keep the typed node. */
export function createGitLabSuggestionClipboardPlugin(): Plugin {
  return new Plugin({ props: { serializeCopiedNode: (_editor, node) =>
    node.type.name === 'gitlab_code_suggestion' ? serializeGitLabSuggestionNode(node) : undefined } });
}
