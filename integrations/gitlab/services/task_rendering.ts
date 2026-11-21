import type { DefaultTreeAdapterMap } from 'parse5';
import type { GitLabMarkdownIssue } from './markdown_codec';

type RawElement = DefaultTreeAdapterMap['element'];
const attr = (element: RawElement, name: string): string | undefined => element.attrs.find(item => item.name === name)?.value;
const setAttr = (element: RawElement, name: string, value: string): void => {
  const existing = element.attrs.find(item => item.name === name);
  if (existing) existing.value = value;
  else element.attrs.push({ name, value });
};

/** Normalize verified renderer-owned task structure before portable HTML import.
 * Third-state carriers are prepared here; callers must still require a schema,
 * serializer and input adapter that explicitly support that state.
 */
export function normalizeGitLabTasks(elements: readonly RawElement[], source: string, inactivePositions?: [number,number][]): {
  issues: GitLabMarkdownIssue[]; inapplicable: Set<RawElement>;
} {
  const issues: GitLabMarkdownIssue[] = [], inapplicable = new Set<RawElement>();
  const sourceLines = source.split(/\r\n|\r|\n/u);
  const hasAuthoredTerminalNewline = (block: RawElement): boolean => {
    const lineNumber = Number(attr(block, 'data-sourcepos')?.match(/^(\d+):/u)?.[1]);
    const line = sourceLines[lineNumber - 2] ?? '';
    // GitLab does not append a second separator when an authored entity already
    // ends the inline body with LF. Escaped ampersands remain literal source.
    const entity = /&(?:#0*10|#[xX]0*[aA]|NewLine);$/u.exec(line);
    if (!entity) return false;
    let backslashes = 0;
    for (let index = entity.index - 1; index >= 0 && line[index] === '\\'; index--) backslashes++;
    return backslashes % 2 === 0;
  };
  const stripSeparators = (item: RawElement): void => {
    for (let index = 1; index < item.childNodes.length; index++) {
      const block = item.childNodes[index]!, previous = item.childNodes[index - 1]!;
      if ('tagName' in block && ['ul', 'ol', 'blockquote', 'pre', 'table', 'p', 'div', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(block.tagName)
        && 'value' in previous && previous.value.endsWith('\n')
        && !hasAuthoredTerminalNewline(block)) previous.value = previous.value.slice(0, -1);
    }
  };
  const checkboxes = new Map<RawElement, RawElement[]>();
  for (const input of elements) {
    if (input.tagName !== 'input' || attr(input, 'type') !== 'checkbox') continue;
    let parent = input.parentNode;
    while (parent && 'tagName' in parent && parent.tagName !== 'li') parent = parent.parentNode;
    if (parent && 'tagName' in parent && parent.tagName === 'li') {
      const owned = checkboxes.get(parent) ?? [];
      owned.push(input); checkboxes.set(parent, owned);
    }
  }

  for (const element of elements) {
    const classes = (attr(element, 'class') ?? '').split(/\s+/u);
    if (!['ul', 'ol'].includes(element.tagName) || !classes.includes('task-list')) continue;
    const items = element.childNodes.filter((node): node is RawElement => 'tagName' in node && node.tagName === 'li');
    if (element.tagName === 'ul') setAttr(element, 'data-type', 'task-list');
    for (const item of items) {
      const task = (attr(item, 'class') ?? '').split(/\s+/u).includes('task-list-item');
      setAttr(item, 'data-type', task ? 'task-item' : 'list-item');
      const owned = checkboxes.get(item), input = owned?.[0];
      const generated = input && attr(input, 'data-checkbox-sourcepos')
        && (attr(input, 'class') ?? '').split(/\s+/u).includes('task-list-item-checkbox');
      if (!task) { if (attr(item, 'data-sourcepos')) stripSeparators(item); continue; }
      if (!input || owned!.length !== 1) { issues.push({ stage: 'import', code: 'task-source', message: 'A GitLab task item requires one unambiguous own checkbox state.' }); continue; }
      const notApplicable = (attr(item, 'class') ?? '').split(/\s+/u).includes('inapplicable');
      const inputNotApplicable = input.attrs.some(value => value.name === 'data-inapplicable');
      if (notApplicable || inputNotApplicable) {
        const position = attr(input, 'data-checkbox-sourcepos')?.match(/^(\d+):(\d+)-\1:\2$/u);
        const sourceLine = sourceLines[Number(position?.[1]) - 1];
        const column = Number(position?.[2]) - 1;
        if (!generated || input.parentNode !== item || !notApplicable || !inputNotApplicable || input.attrs.some(value => value.name === 'checked')
          || !position || sourceLine?.slice(column - 1, column + 2) !== '[~]') {
          issues.push({ stage: 'import', code: 'task-state-source', message: 'The not-applicable task state cannot be matched to its original source.' });
          continue;
        }
        // GitLab inserts one additional space before applying its strike pass.
        // Remove it before unwrapping, then let the ordinary separator logic run.
        const following = input.parentNode!.childNodes[input.parentNode!.childNodes.indexOf(input) + 1];
        if (!following || !('value' in following) || !following.value.startsWith(' ')) {
          issues.push({ stage: 'import', code: 'task-state-spacing', message: 'The generated not-applicable task separator is ambiguous.' });
          continue;
        }
        following.value = following.value.slice(1);
        const unwrap = (parent: RawElement): void => {
          const children = [...parent.childNodes];
          for (const child of children) {
            if (!('tagName' in child) || ['ul', 'ol', 'p', 'div', 'blockquote', 'pre', 'table'].includes(child.tagName)) continue;
            if (child.tagName === 's' && attr(child, 'class') === 'inapplicable' && child.attrs.length === 1) {
              const index = parent.childNodes.indexOf(child);
              parent.childNodes.splice(index, 1, ...child.childNodes);
              for (const grandchild of child.childNodes) grandchild.parentNode = parent;
              inapplicable.add(child);
            } else unwrap(child);
          }
        };
        unwrap(item);
        // Unwrapping can create adjacent text nodes. Coalesce them so the common
        // checkbox separator logic sees the same inline prefix as ordinary tasks.
        for (let index = item.childNodes.length - 1; index > 0; index--) {
          const current = item.childNodes[index]!, previous = item.childNodes[index - 1]!;
          if ('value' in current && 'value' in previous) {
            previous.value += current.value; item.childNodes.splice(index, 1);
          }
        }
        inactivePositions?.push([Number(position[1])-1,column]);
        inapplicable.add(item);
        setAttr(item, 'data-fountain-gitlab-task-state', 'inapplicable');
      }
      setAttr(item, 'data-checked', notApplicable ? 'inapplicable' : input.attrs.some(value => value.name === 'checked') ? 'true' : 'false');
      if (generated) {
        // GitLab inserts one display separator after its checkbox. Preserve all
        // authored whitespace beyond it, including additional spaces, tabs and NBSP.
        const siblings = input.parentNode!.childNodes;
        const next = siblings[siblings.indexOf(input) + 1];
        if (next && 'value' in next && next.value.startsWith(' ')) next.value = next.value.slice(1);
      }
      if (generated) stripSeparators(item);
      input.parentNode!.childNodes = input.parentNode!.childNodes.filter(child => child !== input);
    }
  }
  for (const element of elements) {
    if ((attr(element, 'class') ?? '').split(/\s+/u).includes('inapplicable') && !inapplicable.has(element)) {
      issues.push({ stage: 'import', code: 'task-state-rendering', message: 'A not-applicable display wrapper is not owned by a verified task item.' });
    }
  }
  return { issues, inapplicable };
}
