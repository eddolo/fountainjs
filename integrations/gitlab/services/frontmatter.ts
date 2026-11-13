import type { Editor, Node, NodeSpec } from 'fountainjs-editor';
import type { DefaultTreeAdapterMap } from 'parse5';
import { readGitLabCodeRendering, replaceGitLabCodeRendering } from './code_rendering';

type Element = DefaultTreeAdapterMap['element'];
export type GitLabFrontmatter = { kind: 'fence' } | {
  kind: 'header'; prefix: string; opening: string; closing: string; newline: string; blankLine: boolean;
};
const delimiters: Readonly<Record<string, string>> = { yaml: '---', toml: '+++', json: ';;;' };
const languages: Readonly<Record<string, string>> = { '---': 'yaml', '+++': 'toml', ';;;': 'json' };
const attribute = 'data-fountain-gitlab-frontmatter';
const attr = (element: Element, name: string) => element.attrs.find(item => item.name === name)?.value;

/** Lexical header contract from pinned GitLab::FrontMatter, not a YAML evaluator. */
export function readGitLabFrontmatter(source: string) {
  const opening = source.match(/^((?:[^\r\n]*coding:[^\r\n]*(?:\r\n|[\r\n]))?\s*)((---|\+\+\+|;;;)[ \t]*(\S*))(\r\n|[\r\n])/u);
  if (!opening) return undefined;
  if (!/(?:^|[\r\n])$/u.test(opening[1]!.replace(/^\uFEFF/u, ''))) return undefined;
  const rest = source.slice(opening[0].length);
  const closing = /^(---|\+\+\+|;;;|\.\.\.)[^\S\r\n]*(?:\r\n|[\r\n]|$)/gmu.exec(rest);
  if (!closing) return undefined;
  const body = rest.slice(0, closing.index);
  const text = body.replace(/(?:\r\n|[\r\n])$/u, '');
  const close = closing[0].replace(/(?:\r\n|[\r\n])$/u, '');
  return { language: opening[4] || languages[opening[3]!]!, text,
    metadata: { kind: 'header', prefix: opening[1]!, opening: opening[2]!, closing: close,
      newline: opening[5]!, blankLine: body.length > 0 && text.length === 0 } satisfies GitLabFrontmatter,
    length: opening[0].length + closing.index + closing[0].length };
}

function validMetadata(value: unknown): value is GitLabFrontmatter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (data.kind === 'fence') return Object.keys(data).length === 1;
  return data.kind === 'header' && Object.keys(data).sort().join(',') === 'blankLine,closing,kind,newline,opening,prefix'
    && typeof data.prefix === 'string' && data.prefix.length <= 1_048_576
    && /^(?:[^\r\n]*coding:[^\r\n]*(?:\r\n|[\r\n]))?\s*$/u.test(data.prefix)
    && typeof data.opening === 'string' && /^(?:---|\+\+\+|;;;)[ \t]*[^\s]*$/u.test(data.opening)
    && data.opening.length <= 1024
    && typeof data.closing === 'string' && /^(?:---|\+\+\+|;;;|\.\.\.)[^\S\r\n]*$/u.test(data.closing)
    && data.closing.length <= 1024 && typeof data.newline === 'string' && ['\n', '\r\n', '\r'].includes(data.newline)
    && typeof data.blankLine === 'boolean';
}

export function getGitLabFrontmatter(node: Node): GitLabFrontmatter | undefined {
  return validMetadata(node.attrs.gitlabFrontmatter) ? node.attrs.gitlabFrontmatter : undefined;
}

/** Metadata is not inline prose, even when a wider/directed selection includes it. */
export function selectionIncludesGitLabFrontmatter(editor: Editor): boolean {
  const header = editor.state.doc.content[0];
  if (!header || getGitLabFrontmatter(header)?.kind !== 'header') return false;
  const { selection } = editor.state;
  if (selection.kind === 'all') return true;
  if (selection.kind === 'gap') return selection.position < header.nodeSize;
  const path = selection.kind === 'node' ? selection.nodePath : selection.path;
  return path[0] === 0 || selection.endPath[0] === 0;
}

/** Reuse the engine's code input/selection/history instead of a second text surface. */
export function gitlabFrontmatterCode(base: NodeSpec): NodeSpec {
  return { ...base, attrs: { ...base.attrs, gitlabFrontmatter: { default: null,
    validate: value => value === null || validMetadata(value) } },
    parseHTML: [{ tag: `pre[${attribute}]`, priority: 300, getAttrs: element => {
      try {
        const metadata: unknown = JSON.parse(element.getAttribute(attribute)!);
        const language = element.getAttribute('data-language');
        return validMetadata(metadata) && language && /^[A-Za-z0-9_+.#-]{1,80}$/u.test(language)
          ? { language, gitlabFrontmatter: metadata } : false;
      } catch { return false; }
    } }, ...(base.parseHTML ?? [])],
    toDOM: node => {
      const output = base.toDOM!(node);
      if (!Array.isArray(output) || !output[1] || typeof output[1] !== 'object' || Array.isArray(output[1]))
        throw new Error('GITLAB_FRONTMATTER_CODE_RENDERER');
      return [output[0], { ...output[1], ...(node.attrs.gitlabFrontmatter
        ? { [attribute]: JSON.stringify(node.attrs.gitlabFrontmatter) } : {}) }, ...output.slice(2)] as typeof output;
    },
  };
}

/** HTML alone cannot distinguish a document header from a frontmatter-labelled fence. */
export function normalizeGitLabFrontmatter(elements: readonly Element[], source: string) {
  const header = readGitLabFrontmatter(source), handled = new Set<Element>();
  const issues: { code: string; message: string }[] = [];
  const lines = source.split(/\r\n|[\r\n]/u);
  let usedHeader = false;
  for (const pre of elements) {
    if (pre.tagName !== 'pre' || attr(pre, 'data-lang-params') !== 'frontmatter') continue;
    const language = attr(pre, 'data-canonical-lang') ?? '';
    const rendered = readGitLabCodeRendering(pre, true);
    let metadata: GitLabFrontmatter | undefined;
    const position = attr(pre, 'data-sourcepos')?.match(/^(\d+):(\d+)-(\d+):(\d+)$/u);
    const line = position ? lines[Number(position[1]) - 1]?.slice(Number(position[2]) - 1) : undefined;
    if (rendered !== undefined && /^[A-Za-z0-9_+.#-]{1,80}$/u.test(language) && position) {
      const wrapper = pre.parentNode;
      const rootParent = wrapper && 'tagName' in wrapper && wrapper.tagName === 'div' ? wrapper.parentNode : wrapper;
      const firstRoot = rootParent && 'childNodes' in rootParent ? rootParent.childNodes.find(node =>
        node.nodeName !== '#text' || 'value' in node && Boolean(node.value.trim())) : undefined;
      if (!usedHeader && header && language === header.language && rootParent?.nodeName === '#document-fragment'
        && (firstRoot === pre || firstRoot === wrapper)
        && rendered === header.text.replace(/\r\n?/gu, '\n') && line?.replace(/^\uFEFF/u, '') === header.metadata.opening) {
        metadata = header.metadata; usedHeader = true;
      } else if (line && /^(?:`{3,}|~{3,})([A-Za-z0-9_+.#-]{1,80})(?:[ \t]+|:)frontmatter[ \t]*$/u.exec(line)?.[1] === language) {
        metadata = { kind: 'fence' };
      }
    }
    if (!metadata) {
      issues.push({ code: 'frontmatter-source', message: 'The frontmatter rendering must match its original header or fenced source before visual editing.' });
      continue;
    }
    handled.add(pre);
    replaceGitLabCodeRendering(pre, [{ name: 'data-language', value: language },
      { name: attribute, value: JSON.stringify(metadata) }], rendered!);
  }
  if (header && !usedHeader) issues.push({ code: 'frontmatter-source',
    message: 'The original header was not represented by the host renderer; retain the original source.' });
  return { handled, issues };
}

/** HTML normalizes newlines; recover exact header characters from the matched source. */
export function hydrateGitLabFrontmatter(doc: Node, source: string): Node {
  const header = readGitLabFrontmatter(source), node = doc.content[0];
  if (!header || !node || getGitLabFrontmatter(node)?.kind !== 'header') return doc;
  return node.textContent === header.text ? doc : doc.copy([
    node.copy(header.text ? [node.type.schema.text(header.text)] : []), ...doc.content.slice(1),
  ]);
}

export function changeGitLabFrontmatterLanguage(metadata: GitLabFrontmatter, language: string): GitLabFrontmatter {
  if (metadata.kind === 'fence') return metadata;
  const delimiter = delimiters[language];
  if (!delimiter) throw new Error('GITLAB_FRONTMATTER_LANGUAGE');
  return { ...metadata, opening: delimiter, closing: delimiter };
}

export function serializeGitLabFrontmatter(node: Node, path: readonly number[]): string {
  const metadata: unknown = node.attrs.gitlabFrontmatter;
  if (!validMetadata(metadata) || node.type.name !== 'code_block' || node.content.some(child => !child.isText || child.marks.length)
    || !/^[A-Za-z0-9_+.#-]{1,80}$/u.test(String(node.attrs.language))
    || node.marks.length || node.attrs.layout != null || node.attrs.dir != null || node.attrs.directionGroup != null || node.attrs.lineNumbers === false)
    throw new Error('Frontmatter must remain literal code without unrepresentable formatting.');
  if (metadata.kind === 'fence') {
    const text = node.textContent;
    let length = 3;
    for (const match of text.matchAll(/`+/gu)) length = Math.max(length, match[0].length + 1);
    const fence = '`'.repeat(length);
    return `${fence}${String(node.attrs.language)} frontmatter\n${text}\n${fence}`;
  }
  if (path.length !== 1 || path[0] !== 0) throw new Error('Document frontmatter must remain the first root block.');
  const output = metadata.prefix + metadata.opening + metadata.newline + node.textContent
    + (node.textContent || metadata.blankLine ? metadata.newline : '') + metadata.closing;
  const parsed = readGitLabFrontmatter(output);
  if (!parsed || parsed.length !== output.length || parsed.text !== node.textContent || parsed.language !== node.attrs.language)
    throw new Error('The header source contains a closing delimiter or mismatched language. Retain the source draft.');
  return output;
}
