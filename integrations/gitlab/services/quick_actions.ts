import { CoreSchemaSpec, MarkdownImporter, Schema, type Node } from 'fountainjs-editor';

/** Match the pinned host's fence-aware quick-action isolation, not execution. */
export function transformGitLabQuickActions(markdown: string, mode: 'isolate' | 'literal' = 'isolate'): string {
  let fence = '';
  const lines = markdown.split('\n');
  return lines.map((line, index) => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    const marker = match?.[1] ?? '', info = match?.[2] ?? '';
    if (fence) {
      if (marker[0] === fence[0] && marker.length >= fence.length && !info.trim()) fence = '';
      return line;
    }
    if (marker && !(marker[0] === '`' && info.includes('`'))) fence = marker;
    if (mode === 'literal') return fence ? line : line.replace(/^\/(?=\w)/u, '\\/');
    return fence || index === lines.length - 1 ? line : line.replace(/^\/(.+)$/u, '/$1\n\n');
  }).join('\n');
}

export function gitlabQuickActionText(node: Node): string {
  if (node.isText) return node.text ?? '';
  if (node.type.name === 'gitlab_reference') return String(node.attrs.original);
  if (node.type.name === 'hard_break') return '\n';
  return node.content.map(gitlabQuickActionText).join('');
}

export class GitLabQuickActionSourceError extends Error {
  constructor() { super('GITLAB_QUICK_ACTION_SOURCE_AMBIGUOUS'); }
}

/** Commands are literal one-line source, not inline Markdown formatting. */
export function serializeGitLabQuickAction(node: Node): string | undefined {
  if (node.type.name !== 'paragraph' || node.attrs.gitlabLiteralSlash) return undefined;
  const source = gitlabQuickActionText(node);
  if (!/^\/\w[^\r\n]*$/u.test(source)) return undefined;
  if (node.content.some(child => child.marks.length || !child.isText && child.type.name !== 'gitlab_reference')) return undefined;
  return source;
}

/**
 * Rendering erases the difference between /close, \/close, &#47;close and
 * <p>/close</p>. Keep literal slashes inert after unrelated visual edits.
 * Use our source parser only for root paragraph provenance; GitLab remains the
 * semantic renderer and command authority. Ambiguous ownership is refused.
 */
export function hydrateGitLabQuickActions(document: Node, source: string): Node {
  const slash = (node: Node) => node.type.name === 'paragraph' && /^\/\w/u.test(gitlabQuickActionText(node).trimStart());
  if (!document.content.some(slash)) return protectNested(document, false);
  const parsed = new MarkdownImporter().parseWithSource(source, new Schema(CoreSchemaSpec));
  if (!parsed.source.blocks.length) throw new GitLabQuickActionSourceError();
  const candidates = new Map<string, number>();
  for (const [index, block] of parsed.source.blocks.entries()) {
    if (parsed.document.child(index).type.name !== 'paragraph' || block.source.trimStart().startsWith('<')) continue;
    for (const line of block.source.split(/\r\n|[\r\n]/u)) {
      if (!/^\/\w/u.test(line)) continue;
      const key = line.trimEnd();
      candidates.set(key, (candidates.get(key) ?? 0) + 1);
    }
  }
  const counts = new Map<string, number>();
  const rawLines = new Set(source.split(/\r\n|[\r\n]/u).filter(line => /^\/\w/u.test(line)).map(line => line.trimEnd()));
  for (const node of document.content.filter(slash)) {
    const key = gitlabQuickActionText(node).trim();
    if (rawLines.has(key) && !candidates.has(key)) throw new GitLabQuickActionSourceError();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of candidates) {
    if (counts.get(key) !== count) throw new GitLabQuickActionSourceError();
  }
  return document.copy(document.content.map(node => {
    const active = node.type.name === 'paragraph' && candidates.has(gitlabQuickActionText(node).trim());
    const protectedNode = protectNested(node, active);
    if (!active) return protectedNode;
    // The host adds a terminal line feed while rebuilding isolated commands.
    const last = protectedNode.content.at(-1);
    if (!last?.isText || !/[\r\n]$/u.test(last.text ?? '')) return protectedNode;
    const text = (last.text ?? '').replace(/[\r\n]+$/u, '');
    return protectedNode.copy([...protectedNode.content.slice(0, -1), ...(text ? [last.type.schema.text(text, last.marks)] : [])]);
  }));
}

function protectNested(node: Node, active: boolean): Node {
  const content = node.content.map(child => protectNested(child, false));
  const literal = node.type.name === 'paragraph' && /^\/\w/u.test(gitlabQuickActionText(node).trimStart()) && !active;
  if (literal) return node.type.create({ ...node.attrs, gitlabLiteralSlash: true }, content);
  return content.some((child, index) => child !== node.child(index)) ? node.copy(content) : node;
}
