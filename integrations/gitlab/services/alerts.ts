import type { Node, NodeSpec } from 'fountainjs-editor';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { GitLabMarkdownIssue } from './markdown_codec';

export const GITLAB_ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type GitLabAlertType = typeof GITLAB_ALERT_TYPES[number];
export const GITLAB_ALERT_TITLES: Record<GitLabAlertType, string> = {
  note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution',
};
export const isGitLabAlertType = (value: unknown): value is GitLabAlertType =>
  typeof value === 'string' && GITLAB_ALERT_TYPES.includes(value as GitLabAlertType);
type Element = DefaultTreeAdapterMap['element'];
const attr = (node: Element, name: string): string | undefined => node.attrs.find(item => item.name === name)?.value;
const classes = (node: Element): string[] => (attr(node, 'class') ?? '').split(/\s+/u).filter(Boolean);

export function gitlabAlertNodes(): Record<string, NodeSpec> {
  return {
    gitlab_alert: { group: 'block', content: 'gitlab_alert_title block*', paragraphFlow: 'transparent',
      toText: node => node.content.filter((child, index) => index > 0 || child.textContent).map(child => child.textContent).join('\n'),
      attrs: { kind: { default: 'note', validate: isGitLabAlertType } },
      parseHTML: [{ tag: 'div[data-fountain-gitlab-alert]', priority: 300,
        getAttrs: element => ({ kind: element.getAttribute('data-fountain-gitlab-alert') }) }],
      toDOM: node => ['div', { class: `markdown-alert markdown-alert-${String(node.attrs.kind)}`,
        'data-fountain-gitlab-alert': node.attrs.kind }, 0] },
    gitlab_alert_title: { content: 'text*', code: true, paragraphFlow: 'text', contextualDOM: true,
      validate: node => node.content.every(child => child.isText && !child.marks.length)
        && node.textContent.length <= 1000 && !/[\r\n\0]/u.test(node.textContent),
      parseHTML: [{ tag: 'p[data-fountain-gitlab-alert-title]', priority: 300 }],
      toDOM: (node, context) => {
        const parent = context?.path.slice(0, -1).reduce((value, index) => value.child(index), context.document);
        const kind = parent?.attrs.kind;
        return ['p', { class: 'markdown-alert-title', 'data-fountain-gitlab-alert-title': '',
          'data-fountain-default-title': !node.textContent && isGitLabAlertType(kind) ? GITLAB_ALERT_TITLES[kind] : undefined }, 0];
      } },
  };
}

/** Interpret only verified GitLab alert carriers; body nodes keep their own adapters. */
export function normalizeGitLabAlerts(elements: readonly Element[], source: string): {
  handled: Set<Element>; issues: GitLabMarkdownIssue[];
} {
  const handled = new Set<Element>(), issues: GitLabMarkdownIssue[] = [];
  const lines = source.split(/\r\n|\r|\n/u);
  for (const node of elements) {
    if (node.tagName !== 'div' || !classes(node).includes('markdown-alert')) continue;
    const kinds = classes(node).filter(value => value.startsWith('markdown-alert-')).map(value => value.slice('markdown-alert-'.length));
    const kind = kinds[0];
    const children = node.childNodes.filter(child => child.nodeName !== '#text' || !('value' in child) || child.value.trim());
    const title = children[0] && 'tagName' in children[0] && children[0].tagName === 'p'
      && classes(children[0]).includes('markdown-alert-title') ? children[0] : undefined;
    const ownTitles = children.filter(child => 'tagName' in child && classes(child).includes('markdown-alert-title'));
    const valid = isGitLabAlertType(kind) && kinds.length === 1
      && classes(node).every(value => ['markdown-alert', `markdown-alert-${kind}`].includes(value))
      && node.attrs.every(item => ['class', 'data-sourcepos', 'dir'].includes(item.name))
      && (!attr(node, 'dir') || attr(node, 'dir') === 'auto')
      && title && ownTitles.length === 1
      && title.attrs.every(item => ['class', 'data-sourcepos', 'dir'].includes(item.name))
      && (!attr(title, 'dir') || attr(title, 'dir') === 'auto')
      && classes(title).length === 1 && title.childNodes.every(child => child.nodeName === '#text');
    if (!valid || !title) {
      issues.push({ stage: 'import', code: 'alert-source', message: 'The alert kind, title or metadata is ambiguous; original source is retained.' });
      continue;
    }
    let text = title.childNodes.map(child => 'value' in child ? child.value : '').join('');
    if (text.length > 1000 || /[\r\n\0]/u.test(text)) {
      issues.push({ stage: 'import', code: 'alert-title', message: 'Alert titles must be bounded, single-line literal text.' }); continue;
    }
    const line = Number(attr(node, 'data-sourcepos')?.match(/^(\d+):/u)?.[1]);
    const header = lines[line - 1]?.match(/^(?:[\t >]|[-+*][\t ]+|\d+[.)][\t ]+)*\[!(note|tip|important|warning|caution)\](?:[\t ]+([\s\S]*))?[\t ]*$/iu);
    if (header) {
      const declared = (header[2] ?? '').trim();
      if (header[1]!.toLowerCase() !== kind || text !== (declared || GITLAB_ALERT_TITLES[kind])) {
        issues.push({ stage: 'import', code: 'alert-title-source', message: 'The rendered alert title does not agree with its source header.' }); continue;
      }
      if (!declared) text = '';
    }
    node.attrs = [{ name: 'data-fountain-gitlab-alert', value: kind }];
    title.attrs = [{ name: 'data-fountain-gitlab-alert-title', value: '' }];
    title.childNodes = [{ nodeName: '#text', value: text, parentNode: title }];
    handled.add(node); handled.add(title);
  }
  return { handled, issues };
}

/** Empty editable titles need a real model text leaf, rather than a DOM-only anchor. */
export function hydrateGitLabAlertTitles(node: Node): Node {
  if (node.type.name === 'gitlab_alert_title' && !node.childCount) return node.copy([node.type.schema.text('')]);
  const content = node.content.map(hydrateGitLabAlertTitles);
  return content.some((child, index) => child !== node.child(index)) ? node.copy(content) : node;
}
