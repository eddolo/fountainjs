import type { ServerHTMLImporterOptions } from 'fountainjs-editor/html/server';
import type { GitLabRenderResponse } from './asset_resolver';
import { readGitLabFrontmatter } from './frontmatter';
import { gitLabFootnoteSourceDefinitions } from './footnote_source';
import { inspectGitLabFootnoteProjection, normalizeGitLabFootnoteProjection } from './footnote_projection';
import { prepareGitLabFootnoteProbe, type GitLabFootnoteProbe } from './footnote_rendering';
import type { GitLabFootnoteSpan } from './footnote_positions';

function originalSpan(span: GitLabFootnoteSpan, probe: GitLabFootnoteProbe): GitLabFootnoteSpan | undefined {
  if (span.to <= probe.insertion) return span;
  const end = probe.insertion + probe.prefix.length;
  return span.from >= end ? { from: span.from - probe.prefix.length, to: span.to - probe.prefix.length } : undefined;
}
const key = (span: GitLabFootnoteSpan) => `${span.from}:${span.to}`;

/** A second render may expose bodies, but it must not reinterpret existing references. */
export function verifyGitLabFootnoteProbeReferences(
  original: ReturnType<typeof inspectGitLabFootnoteProjection>,
  enriched: ReturnType<typeof inspectGitLabFootnoteProjection>, probe: GitLabFootnoteProbe,
): readonly string[] {
  const issues: string[] = [], seen = new Set<string>();
  const existing = new Map(original.references.map(reference => [key(reference.span), reference]));
  const visible = new Set(original.definitions.map(definition => key(definition.span)));
  for (const reference of enriched.references) {
    const span = originalSpan(reference.span, probe), definition = originalSpan(reference.definition.span, probe);
    if (!span || !definition) { issues.push('footnote-probe-reference-source'); continue; }
    const before = existing.get(key(span));
    if (before) {
      seen.add(key(span));
      if (before.label !== reference.label || key(before.definition.span) !== key(definition)) issues.push('footnote-probe-reference-target');
    } else {
      const owns = enriched.definitions.some(note => {
        const candidate = originalSpan(note.span, probe);
        return candidate && !visible.has(key(candidate)) && candidate.from <= span.from && candidate.to >= span.to;
      });
      if (!owns) issues.push('footnote-probe-added-reference');
    }
  }
  if ([...existing.keys()].some(id => !seen.has(id))) issues.push('footnote-probe-missing-reference');
  return issues;
}

/** Native import is allowed only when every discovered definition is represented. */
export async function convertGitLabFootnotes(source: string, html: string, options: {
  renderMarkdown(source: string, options: { signal: AbortSignal }): Promise<GitLabRenderResponse>;
  signal: AbortSignal; html?: ServerHTMLImporterOptions;
}): Promise<{ html?: string; issues: readonly string[] }> {
  const maxBytes = options.html?.maxInputBytes ?? 1_048_576;
  const count = gitLabFootnoteSourceDefinitions(source, maxBytes).length;
  if (!count && !/data-footnote(?:s|-(?:ref|backref))/u.test(html)) return { html, issues: [] };
  // Conservative input bound, not a substitute for the host's limit parser.
  if ([...source.matchAll(/\[\^[^\]\r\n]+\]/gu)].length > 1000) return { issues: ['footnote-reference-limit'] };
  const limits = { maxBytes, maxNodes: options.html?.maxNodes, maxDepth: options.html?.maxDepth };
  const primary = inspectGitLabFootnoteProjection(source, html, limits);
  if (primary.issues.length) return { issues: primary.issues };
  if (primary.definitions.length === count) {
    const result = normalizeGitLabFootnoteProjection(source, html, { ...limits, expectedDefinitions: count });
    return { html: result.html, issues: result.issues };
  }
  const probe = prepareGitLabFootnoteProbe(source, readGitLabFrontmatter(source)?.length ?? 0, maxBytes);
  if (!probe) return { issues: ['footnote-omitted-definitions'] };
  if ([...probe.source.matchAll(/\[\^[^\]\r\n]+\]/gu)].length > 1000) return { issues: ['footnote-reference-limit'] };
  if (options.signal.aborted) throw new Error('GitLab footnote rendering was cancelled.');
  const response = await options.renderMarkdown(probe.source, { signal: options.signal });
  if (options.signal.aborted) throw new Error('GitLab footnote rendering was cancelled.');
  if (typeof response?.body !== 'string') return { issues: ['footnote-render-response'] };
  const enriched = inspectGitLabFootnoteProjection(probe.source, response.body, { ...limits, probe, expectedDefinitions: count });
  const ownership = verifyGitLabFootnoteProbeReferences(primary, enriched, probe);
  if (enriched.issues.length || ownership.length) return { issues: [...enriched.issues, ...ownership] };
  const result = normalizeGitLabFootnoteProjection(probe.source, response.body, { ...limits, probe, expectedDefinitions: count });
  return { html: result.html, issues: result.issues };
}
