import type { MarkSpec, Node } from 'fountainjs-editor';

// The uploading browser owns the object URL. Keep it only for GitLab's wire round trip.
// Other clients show the filename and never navigate to, fetch or persist the object URL.
export const pendingWikiFile: MarkSpec = {
  attrs: {
    uploadId: {validate:value => typeof value === 'string' && /^file[0-9]{1,20}$/u.test(value)},
    objectURL: {validate:value => typeof value === 'string' && value.length <= 4096
      && /^blob:(?:https?:\/\/[^\s<>/?#]+|null)\/[0-9a-f-]{36}$/iu.test(value)},
  },
  toDOM: () => ['span',{'data-fountain-pending-wiki-file':'true','aria-busy':'true'},0],
};

const pending = new WeakMap<Node,boolean>();
export function hasPendingWikiFile(node: Node): boolean {
  const cached = pending.get(node);
  if (cached !== undefined) return cached;
  const result = node.marks.some(mark => mark.type.name === 'gitlab_pending_wiki_file') || node.content.some(hasPendingWikiFile);
  pending.set(node,result);
  return result;
}
