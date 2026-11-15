import { CoreSchemaSpec, MarkdownImporter, Schema } from 'fountainjs-editor';
import { readGitLabFrontmatter } from './frontmatter';

// Inspection grammar only: these labels never become editor IDs or DOM anchors.
// Reuse Fountain's block/container parser so code, HTML, escapes and nested
// containers do not need another ad-hoc footnote-definition scanner here.
const label = { validate: (value: unknown) => typeof value === 'string' && value.length > 0
  && value.length <= 4096 };
const probe = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  footnote_reference: { group: 'inline', inline: true, atom: true, attrs: { id: label } },
  footnote_definition: { group: 'block', content: 'block+', attrs: { id: label } },
} });

/** Detect source the host can omit entirely; this is not a body converter. */
export function gitLabFootnoteSourceDefinitions(source: string, maxBytes: number): readonly string[] {
  const candidate = /\[\^([^\]\u0000-\u0020\u007f]+)\]:/gu;
  if (!candidate.test(source)) return [];
  if (new TextEncoder().encode(source).length > maxBytes) throw new Error('GitLab footnote source exceeds the configured byte limit.');
  const body = source.slice(readGitLabFrontmatter(source)?.length ?? 0);
  candidate.lastIndex = 0;
  const candidates = [...new Set([...body.matchAll(candidate)].map(match => match[1]!))];
  if (!candidates.length) return [];
  if (candidates.some(value => value.length > 4096)) throw new Error('GitLab footnote source exceeds the configured label limit.');
  if (candidates.length > 1000) throw new Error('GitLab footnote source exceeds the host reference limit.');
  // Only raw, space-free label syntax is eligible. Decode it through the same
  // parser as definitions: entity/escape decoding may produce brackets or spaces
  // in inspection metadata even though those values cannot be native note IDs.
  const eligible = new Set<string>();
  new MarkdownImporter().parse(candidates.map(value => `[^${value}]`).join(' '), probe)
    .descendants(node => { if (node.type.name === 'footnote_reference') eligible.add(String(node.attrs.id)); });
  const document = new MarkdownImporter().parse(body, probe);
  return document.content.filter(node => node.type.name === 'footnote_definition' && eligible.has(String(node.attrs.id)))
    .map(node => String(node.attrs.id));
}

export function gitLabHasFootnoteDefinitions(source: string, maxBytes: number): boolean {
  return gitLabFootnoteSourceDefinitions(source, maxBytes).length > 0;
}
