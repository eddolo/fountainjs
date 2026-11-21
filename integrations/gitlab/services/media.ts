import { MarkdownExporter, MarkdownImporter, isSafeURL, type NodeSpec, type Schema } from 'fountainjs-editor';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { GitLabMarkdownIssue } from './markdown_codec';
import { GitLabFootnotePositions } from './footnote_positions';
import { GitLabPlayableView } from '../components/media_view';

export type GitLabPlayableKind = 'audio' | 'video';
export interface GitLabMediaFields {
  readonly canonical: string;
  readonly alt: string;
  readonly title: string;
  readonly width: string;
  readonly height: string;
}
export const isGitLabMediaURL = (value: unknown): value is string => typeof value === 'string'
  && value.length <= 2048 && value === value.trim() && isSafeURL(value)
  && !/^(?:data:|blob:|mailto:|tel:|#)/iu.test(value);
const literal = (value: unknown): value is string => typeof value === 'string' && value.length <= 10_000 && !/[\r\n\0]/u.test(value);
export function gitlabMediaDimension(value: unknown): string {
  if (value === 'auto') return '';
  if (typeof value !== 'string' || value.length > 40 || !/^\d+(?:\.\d+)?(?:px|%)?$/u.test(value)) throw new Error('GITLAB_MEDIA_INVALID_DIMENSION');
  return value.endsWith('px') ? value.slice(0, -2) : value;
}
export function gitlabMediaCSSDimension(value: unknown): string {
  const dimension = gitlabMediaDimension(value);
  return !dimension ? 'auto' : dimension.endsWith('%') ? dimension : `${dimension}px`;
}

/** Use Fountain's existing Markdown escaping, then add GitLab's native size syntax. */
export function gitlabMediaSource(schema: Schema, fields: GitLabMediaFields): string {
  if (!isGitLabMediaURL(fields.canonical)) throw new Error('GITLAB_MEDIA_INVALID_URL');
  if (!literal(fields.alt) || !literal(fields.title)) throw new Error('GITLAB_MEDIA_INVALID_DESCRIPTION');
  const width = gitlabMediaDimension(fields.width), height = gitlabMediaDimension(fields.height);
  const image = schema.node('inline_image', { src: fields.canonical, alt: fields.alt, title: fields.title });
  const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [image])]);
  const source = new MarkdownExporter().export(doc);
  const sizes = [...(width ? [`width=${JSON.stringify(width)}`] : []), ...(height ? [`height=${JSON.stringify(height)}`] : [])];
  return source + (sizes.length ? `{${sizes.join(' ')}}` : '');
}

export function gitlabMediaNodes(labels: Readonly<Record<GitLabPlayableKind, string>> = { audio: 'Select audio', video: 'Select video' }): Record<string, NodeSpec> {
  return { gitlab_media: { group: 'inline', inline: true, atom: true,
    attrs: {
      kind: { validate: value => value === 'audio' || value === 'video' },
      src: { validate: isGitLabMediaURL }, gitlabCanonicalSrc: { validate: isGitLabMediaURL },
      alt: { default: '', validate: literal }, title: { default: '', validate: literal },
      width: { default: 'auto', validate: value => { try { gitlabMediaDimension(value); return true; } catch { return false; } } },
      height: { default: 'auto', validate: value => { try { gitlabMediaDimension(value); return true; } catch { return false; } } },
    },
    parseHTML: [{ tag: 'span[data-fountain-gitlab-media]', priority: 350, getAttrs: element => ({
      kind: element.getAttribute('data-fountain-gitlab-media'), src: element.getAttribute('data-media-src'),
      gitlabCanonicalSrc: element.getAttribute('data-media-canonical'), alt: element.getAttribute('data-media-alt') ?? '',
      title: element.getAttribute('data-media-title') ?? '', width: element.getAttribute('data-media-width') ?? 'auto', height: element.getAttribute('data-media-height') ?? 'auto',
    }) }],
    toText: node => String(node.attrs.alt || node.attrs.gitlabCanonicalSrc),
    nodeView: class extends GitLabPlayableView {
      constructor(node: ConstructorParameters<typeof GitLabPlayableView>[0], view: unknown, getPath: () => number[]) {
        super(node, view, getPath, labels[node.attrs.kind as GitLabPlayableKind]);
      }
    },
    toDOM: node => ['span', { 'data-fountain-gitlab-media': node.attrs.kind,
      'data-media-src': node.attrs.src, 'data-media-canonical': node.attrs.gitlabCanonicalSrc,
      'data-media-alt': node.attrs.alt, 'data-media-title': node.attrs.title,
      'data-media-width': node.attrs.width, 'data-media-height': node.attrs.height,
      class: `media-container ${String(node.attrs.kind)}-container`,
    }, [String(node.attrs.kind), { src: node.attrs.src, controls: '', preload: 'metadata',
      'aria-label': node.attrs.alt || undefined, title: node.attrs.title || undefined,
      style: ['max-width:100%', ...(['width', 'height'] as const).flatMap(dimension => node.attrs[dimension] === 'auto' ? [] : [`${dimension}:${String(node.attrs[dimension])}`])].join(';') }]],
  } };
}

type Element = DefaultTreeAdapterMap['element'];
const attr = (element: Element, name: string): string | undefined => element.attrs.find(item => item.name === name)?.value;
const classes = (element: Element): string[] => (attr(element, 'class') ?? '').split(/\s+/u).filter(Boolean);
function imageSourcePosition(image: Element): string | undefined {
  const own = attr(image, 'data-sourcepos');
  if (own !== undefined) return own;
  let child = image;
  let parent = child.parentNode;
  // GitLab can wrap a lazy image with its own download link. The wrapper or
  // paragraph span belongs to the image only when it has no other content.
  if (parent && 'tagName' in parent && parent.tagName === 'a' && classes(parent).includes('no-attachment-icon')
    && parent.childNodes.length === 1) {
    child = parent;
    const wrapper = attr(child, 'data-sourcepos');
    if (wrapper !== undefined) return wrapper;
    parent = child.parentNode;
  }
  if (parent && 'tagName' in parent && parent.tagName === 'p' && parent.childNodes.length === 1) {
    return attr(parent, 'data-sourcepos');
  }
  return undefined;
}

/** Resolve each missing image address from its own host-reported UTF-8 span.
 * The existing Markdown parser resolves labels in the author's definition scope.
 * Reader and proxy URLs remain display-only.
 */
export function recoverGitLabImageSources(elements: readonly Element[], source: string, schema: Schema, maxBytes: number): void {
  let positions: GitLabFootnotePositions | undefined;
  const ranges: { image: Element; from: number; to: number; missing: boolean }[] = [];
  if (!elements.some(el => el.tagName === 'img' && attr(el, 'data-src') && !attr(el, 'data-canonical-src'))) return;
  for (const image of elements) {
    if (image.tagName !== 'img') continue;
    const parent = image.parentNode;
    const wrapperCanonical = parent && 'tagName' in parent && parent.tagName === 'a' && classes(parent).includes('no-attachment-icon')
      && attr(parent, 'data-canonical-src');
    const missing = Boolean(attr(image, 'data-src') && !attr(image, 'data-canonical-src') && !wrapperCanonical);
    const position = imageSourcePosition(image);
    if (!position) continue;
    positions ??= new GitLabFootnotePositions(source, maxBytes);
    const range = positions.read(position);
    if (range && source.startsWith('![', range.from)) ranges.push({ image, missing, ...range });
  }
  if (!ranges.length) return;
  ranges.sort((a,b) => a.from - b.from || a.to - b.to);
  // Overlapping claims cannot identify independent instances. Bound total parsed
  // token size by the source length and leave ambiguous images unresolved.
  let end = 0;
  const candidates = ranges.filter((range,i) => {
    const overlaps = range.from < end || (ranges[i + 1]?.from ?? Infinity) < range.to;
    end = Math.max(end, range.to);
    return range.missing && !overlaps;
  });
  if (!candidates.length) return;
  const read = MarkdownImporter.createInlineReader(source, schema);
  candidates.forEach(({image, from, to}) => {
    const nodes = read(source.slice(from,to));
    const parsed = nodes[0];
    if (nodes.length !== 1 || parsed?.type.name !== 'inline_image' || parsed.marks.length || !isGitLabMediaURL(parsed.attrs.src)
      || parsed.attrs.alt !== (attr(image, 'alt') ?? '') || (parsed.attrs.title ?? '') !== (attr(image, 'title') ?? '')) return;
    image.attrs.push({ name: 'data-canonical-src', value: parsed.attrs.src });
  });
}

function sourceDimensions(text: string | undefined): { width?: string; height?: string } {
  const declaration = text?.match(/^\{([^{}\r\n]{1,200})\}/u)?.[1];
  if (!declaration) return {};
  const attribute = /(?:^|\s+)(width|height)=(?:"([^"]*)"|'([^']*)'|([^\s"'=]+))/gu;
  const entries = [...declaration.matchAll(attribute)];
  if (!entries.length || declaration.replace(attribute, '').trim()) return {};
  if (new Set(entries.map(entry => entry[1])).size !== entries.length) throw new Error('Ambiguous media source dimensions.');
  return Object.fromEntries(entries.map(entry => [entry[1], gitlabMediaCSSDimension(entry[2] ?? entry[3] ?? entry[4])])) as { width?: string; height?: string };
}
export function normalizeGitLabMedia(elements: readonly Element[], source: string, schema: Schema): { handled: Set<Element>; issues: GitLabMarkdownIssue[] } {
  const handled = new Set<Element>(), issues: GitLabMarkdownIssue[] = [];
  const hasPlayable = elements.some(element => classes(element).some(name => ['audio-container', 'video-container'].includes(name)));
  const candidates: { canonical: string; alt: string; title: string; width?: string; height?: string }[] = [];
  if (hasPlayable || source.includes('<')) {
    // GitLab alert titles are literal; keep their syntax out of Markdown source analysis.
    const lines = source.split(/\r\n|\r|\n/u);
    for (const element of elements.filter(element => classes(element).includes('markdown-alert'))) {
      const line = Number(attr(element, 'data-sourcepos')?.match(/^(\d+):/u)?.[1]) - 1;
      if (line >= 0 && line < lines.length) lines[line] = lines[line]!.replace(/(\[!(?:note|tip|important|warning|caution)\][\t ]+)(.*)$/iu,
        (_match, prefix: string, title: string) => prefix + Array.from(title, character => `&#${character.codePointAt(0)};`).join(''));
    }
    let rawMedia = false;
    const inspect = (html: string): void => {
      const stack: DefaultTreeAdapterMap['node'][] = [parseFragment(html)];
      while (stack.length) {
        const node = stack.pop()!;
        if ('tagName' in node && ['audio', 'video', 'iframe', 'source', 'track'].includes(node.tagName)) rawMedia = true;
        if ('childNodes' in node) stack.push(...node.childNodes);
      }
    };
    const parsed = new MarkdownImporter().parse(lines.join('\n'), schema, { autolinkLiterals: false,
      parseHTMLBlock: html => { inspect(html); return null; },
      parseHTMLInline: segments => { segments.forEach(segment => { if (segment.kind === 'html') inspect(segment.html); }); return null; },
    });
    parsed.descendants((node, path, parent) => {
      if (!['inline_image', 'image_super'].includes(node.type.name)) return;
      const following = parent?.content[(path.at(-1) ?? -1) + 1];
      candidates.push({ canonical: String(node.attrs.src), alt: String(node.attrs.alt), title: String(node.attrs.title ?? ''),
        ...(following?.isText ? sourceDimensions(following.text) : {}) });
    });
    if (rawMedia) issues.push({ stage: 'import', code: 'raw-media-source', message: 'The pinned GitLab renderer does not retain raw HTML media. Keep the original source instead of editing an incomplete rendering.' });
  }
  for (const root of elements) {
    const names = classes(root), kinds = ['audio', 'video'].filter(kind => names.includes(`${kind}-container`));
    if (!kinds.length) continue;
    const children = root.childNodes.filter(child => child.nodeName !== '#text' || !('value' in child) || child.value.trim());
    const media = children[0] && 'tagName' in children[0] ? children[0] : undefined;
    try {
      if (root.tagName !== 'span' || kinds.length !== 1 || !names.includes('media-container')
        || names.some(name => !['media-container', `${kinds[0]}-container`].includes(name))
        || root.attrs.some(item => item.name !== 'class') || children.length !== 1 || !media || media.tagName !== kinds[0]
        || media.childNodes.length || media.attrs.some(item => !['src', 'controls', 'data-setup', 'data-title', 'data-canonical-src', 'class', 'preload', 'width', 'height'].includes(item.name))
        || classes(media).some(name => !['gfm', 'gl-rounded-lg'].includes(name))
        || !['', 'true'].includes(attr(media, 'controls') ?? 'missing')
        || !['{}', undefined].includes(attr(media, 'data-setup'))
        || !['metadata', 'none', undefined].includes(attr(media, 'preload'))) throw new Error('Unrecognized playable markup.');
      const src = attr(media, 'src'), canonical = attr(media, 'data-canonical-src'), label = attr(media, 'data-title') ?? '';
      if (!isGitLabMediaURL(src) || !isGitLabMediaURL(canonical) || !literal(label)) throw new Error('Invalid media source or description.');
      // GitLab renders title || alt into data-title, omitting the other field.
      const descriptions = new Map(candidates.filter(item => item.canonical === canonical && (item.title || item.alt) === label)
        .map(item => [JSON.stringify([item.alt, item.title, ...(kinds[0] === 'audio' ? [item.width, item.height] : [])]), item]));
      if (descriptions.size !== 1) throw new Error('The media source description/title cannot be mapped unambiguously.');
      const matched = [...descriptions.values()][0]!, { alt, title } = matched;
      const width = gitlabMediaCSSDimension(attr(media, 'width') ?? matched.width ?? 'auto'), height = gitlabMediaCSSDimension(attr(media, 'height') ?? matched.height ?? 'auto');
      root.attrs = [
        ['data-fountain-gitlab-media', kinds[0]!], ['data-media-src', src], ['data-media-canonical', canonical],
        ['data-media-alt', alt], ['data-media-title', title], ['data-media-width', width], ['data-media-height', height],
      ].map(([name, value]) => ({ name: name!, value: value! }));
      root.childNodes = [];
      handled.add(root); handled.add(media);
    } catch (error) {
      issues.push({ stage: 'import', code: 'media-source', message: `${error instanceof Error ? error.message : 'Invalid media.'} Original source is retained.` });
    }
  }
  return { handled, issues };
}
