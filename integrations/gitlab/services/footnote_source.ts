import { CoreSchemaSpec, MarkdownImporter, Schema } from 'fountainjs-editor';
import { readGitLabFrontmatter } from './frontmatter';

// Inspection grammar only: these labels never become editor IDs or DOM anchors.
// Reuse Fountain's block/container parser so code, HTML, escapes and nested
// containers do not need another ad-hoc footnote-definition scanner here.
const label = { validate: (value: unknown) => typeof value === 'string' && value.length > 0
  && value.length <= 4096 && !/[\[\]\u0000-\u0020\u007f]/u.test(value) };
const probe = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  footnote_reference: { group: 'inline', inline: true, atom: true, attrs: { id: label } },
  footnote_definition: { group: 'block', content: 'block+', attrs: { id: label } },
} });

/** Detect source the host can omit entirely; this is not a body converter. */
export function gitLabHasFootnoteDefinitions(source: string, maxBytes: number): boolean {
  const candidate = /\[\^[^\]\u0000-\u0020]+\]:/u;
  if (!candidate.test(source)) return false;
  if (new TextEncoder().encode(source).length > maxBytes) throw new Error('GitLab footnote source exceeds the configured byte limit.');
  const body = source.slice(readGitLabFrontmatter(source)?.length ?? 0);
  if (!candidate.test(body)) return false;
  const document = new MarkdownImporter().parse(body, probe);
  return document.content.some(node => node.type.name === 'footnote_definition');
}
