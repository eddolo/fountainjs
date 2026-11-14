import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { isSafeURL } from 'fountainjs-editor';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];
export interface GitLabRenderResponse { body?: string; references?: { commands?: string } }
export interface GitLabAssetResolverOptions {
  renderMarkdown(markdown: string, options?: { signal: AbortSignal }): Promise<GitLabRenderResponse>;
  describeLabels(action: 'add' | 'remove' | 'replace', count: number): string;
  onIssue?(issue: { code: 'render-failed' | 'invalid-response' | 'unsafe-url'; message: string }): void;
  maxCacheEntries?: number;
  maxHTMLBytes?: number;
  maxCacheBytes?: number;
}

const attr = (element: Element, name: string): string | null => element.attrs.find(value => value.name === name)?.value ?? null;
const hasClass = (element: Element, name: string): boolean => (attr(element, 'class') ?? '').split(/\s+/u).includes(name);
const escapeDestination = (value: string): string => value.replace(/[\\()"]/gu, '\\$&');
const encoder = new TextEncoder();

function elements(html: string, limit: number): Element[] {
  if (typeof html !== 'string' || encoder.encode(html).length > limit) throw new Error('Invalid or oversized GitLab HTML response.');
  const fragment = parseFragment(html), stack: { node: Node; depth: number }[] = [{ node: fragment, depth: 0 }];
  const found: Element[] = [];
  let nodes = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++nodes > 50_000 || depth > 128) throw new Error('GitLab HTML response exceeds the inspection limits.');
    if ('tagName' in node) found.push(node);
    if ('childNodes' in node) for (let index = node.childNodes.length - 1; index >= 0; index--) {
      stack.push({ node: node.childNodes[index]!, depth: depth + 1 });
    }
  }
  return found;
}
function text(element: Element): string {
  const stack: Node[] = [element], parts: string[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeName === '#text' && 'value' in node) parts.push(node.value);
    if ('childNodes' in node) for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push(node.childNodes[index]!);
  }
  return parts.join('');
}

/** Real GitLab render-callback boundary; no DOM, network client or credentials. */
export class GitLabAssetResolver {
  private readonly cache = new Map<string, { promise: Promise<GitLabRenderResponse>; bytes: number }>();
  private readonly pending = new Set<AbortController>();
  private cacheBytes = 0;
  private disposed = false;
  private readonly capacity: number;
  private readonly htmlLimit: number;
  private readonly cacheLimit: number;

  constructor(private readonly options: GitLabAssetResolverOptions) {
    if (typeof options.renderMarkdown !== 'function' || typeof options.describeLabels !== 'function') {
      throw new TypeError('Provide the real GitLab renderer and host label-description localizer.');
    }
    this.capacity = options.maxCacheEntries ?? 100;
    this.htmlLimit = options.maxHTMLBytes ?? 1_048_576;
    this.cacheLimit = options.maxCacheBytes ?? 4_194_304;
    if (!Number.isInteger(this.capacity) || this.capacity < 1 || this.capacity > 1000
      || !Number.isInteger(this.htmlLimit) || this.htmlLimit < 1 || this.htmlLimit > 8_388_608
      || !Number.isInteger(this.cacheLimit) || this.cacheLimit < 1 || this.cacheLimit > 16_777_216) {
      throw new RangeError('Invalid GitLab resolver cache or HTML capacity.');
    }
  }

  private issue(code: 'render-failed' | 'invalid-response' | 'unsafe-url', message: string): void {
    this.options.onIssue?.({ code, message });
  }
  private inspect(html: string | undefined): Element[] {
    if (html === undefined || html === '') return [];
    try { return elements(html, this.htmlLimit); }
    catch { this.issue('invalid-response', 'GitLab returned invalid or over-limit HTML.'); return []; }
  }
  private safe(value: string | null): string | null {
    if (value !== null && isSafeURL(value)) return value;
    if (value !== null) this.issue('unsafe-url', 'GitLab returned an unsafe resource URL.');
    return null;
  }
  private source(value: string): string {
    if (this.disposed) throw new Error('The GitLab asset resolver has been disposed.');
    if (!isSafeURL(value) || value.length > 2048) throw new TypeError('Expected a safe canonical resource URL of at most 2048 characters.');
    return value;
  }
  private async render(markdown: string): Promise<GitLabRenderResponse> {
    if (this.disposed) throw new Error('The GitLab asset resolver has been disposed.');
    if (typeof markdown !== 'string' || encoder.encode(markdown).length > this.htmlLimit) throw new RangeError('GitLab render input is invalid or over limit.');
    const cached = this.cache.get(markdown);
    if (cached) { this.cache.delete(markdown); this.cache.set(markdown, cached); return cached.promise; }
    const cancel = new AbortController();
    this.pending.add(cancel);
    let release!: () => void;
    const cancelled = new Promise<GitLabRenderResponse>(resolve => {
      release = () => resolve({}); cancel.signal.addEventListener('abort', release, { once: true });
    });
    const promise: Promise<GitLabRenderResponse> = Promise.race<GitLabRenderResponse>([
      Promise.resolve().then(() => cancel.signal.aborted ? {} : this.options.renderMarkdown(markdown, { signal: cancel.signal })), cancelled,
    ]).then(response => {
      if (!response || typeof response !== 'object' || Array.isArray(response) || (response.body !== undefined && typeof response.body !== 'string')
        || (response.references !== undefined && (!response.references || typeof response.references !== 'object' || Array.isArray(response.references)
          || response.references.commands !== undefined && typeof response.references.commands !== 'string'))) {
        this.issue('invalid-response', 'GitLab returned an invalid rendering envelope.');
        if (this.cache.get(markdown)?.promise === promise) this.evict(markdown);
        return {};
      }
      const bytes = encoder.encode(response.body ?? '').length + encoder.encode(response.references?.commands ?? '').length;
      if (bytes > this.htmlLimit) {
        this.issue('invalid-response', 'GitLab returned an over-limit rendering envelope.');
        if (this.cache.get(markdown)?.promise === promise) this.evict(markdown);
        return {};
      }
      const entry = this.cache.get(markdown);
      if (entry?.promise === promise) { entry.bytes += bytes; this.cacheBytes += bytes; this.trim(); }
      return Object.freeze({ body: response.body, references: response.references ? Object.freeze({ commands: response.references.commands }) : undefined });
    }).catch(() => {
      if (this.cache.get(markdown)?.promise === promise) this.evict(markdown);
      if (!cancel.signal.aborted) this.issue('render-failed', 'GitLab rendering failed; the canonical source remains available.');
      return {};
    }).finally(() => { cancel.signal.removeEventListener('abort', release); this.pending.delete(cancel); });
    const bytes = encoder.encode(markdown).length;
    this.cache.set(markdown, { promise, bytes }); this.cacheBytes += bytes; this.trim();
    return promise;
  }
  private evict(key: string): void {
    this.cacheBytes -= this.cache.get(key)?.bytes ?? 0;
    this.cache.delete(key);
  }
  private trim(): void {
    while (this.cache.size > this.capacity || this.cacheBytes > this.cacheLimit) this.evict(this.cache.keys().next().value!);
  }

  async resolveUrl(canonicalSrc: string): Promise<string> {
    this.source(canonicalSrc);
    const response = await this.render(`[link](${escapeDestination(canonicalSrc)})`);
    const anchor = this.inspect(response.body).find(element => element.tagName === 'a');
    return anchor ? this.safe(attr(anchor, 'href')) ?? canonicalSrc : canonicalSrc;
  }
  async resolveIframeSrc(canonicalSrc: string): Promise<{ src: string; providerId: string | null }> {
    this.source(canonicalSrc);
    const response = await this.render(`![image](${escapeDestination(canonicalSrc)})`);
    const embed = this.inspect(response.body).find(element => hasClass(element, 'js-render-iframe'));
    const src = embed && this.safe(attr(embed, 'data-iframe-src'));
    const provider = embed && attr(embed, 'data-iframe-provider-id');
    return { src: src || canonicalSrc, providerId: src && provider && /^[a-z][a-z\d_-]{0,63}$/iu.test(provider) ? provider : null };
  }
  async resolvePlaceholder(placeholder: string): Promise<{ placeholder: string; value: string } | null> {
    const response = await this.render(placeholder);
    const span = this.inspect(response.body).find(element => element.tagName === 'span' && attr(element, 'data-placeholder') === placeholder);
    return span && text(span) ? { placeholder, value: text(span) } : null;
  }
  async resolveReference(originalText: string): Promise<{ href?: string; text?: string; expandedText?: string; fullyExpandedText?: string; backgroundColor?: string }> {
    const reference = originalText.replace(/(?:\+s|\+)$/u, '');
    const response = await this.render(`${reference} ${reference}+ ${reference}+s`);
    const anchors = this.inspect(response.body).filter(element => element.tagName === 'a');
    if (!anchors.length) return {};
    const href = this.safe(attr(anchors[0]!, 'href'));
    if (!href) return {};
    const child = anchors[0]!.childNodes.find((node): node is Element => 'tagName' in node);
    const hex = child && attr(child, 'style')?.match(/(?:^|;)\s*background-color\s*:\s*#([a-f\d]{6}|[a-f\d]{3})\s*(?:;|$)/iu)?.[1];
    const expanded = hex?.length === 3 ? [...hex].map(character => character.repeat(2)).join('') : hex;
    const color = expanded ? `rgb(${[0, 2, 4].map(index => Number.parseInt(expanded.slice(index, index + 2), 16)).join(', ')})` : undefined;
    return { href, text: text(anchors[0]!), expandedText: anchors[1] ? text(anchors[1]) : undefined,
      fullyExpandedText: anchors[2] ? text(anchors[2]) : undefined, backgroundColor: color };
  }
  async explainQuickAction(source: string, options?: { strict?: boolean }): Promise<string> {
    const response = await this.render(source);
    if (options?.strict && typeof response.body !== 'string') throw new Error('GITLAB_QUICK_ACTION_PREVIEW_FAILED');
    const parsed = this.inspect(response.references?.commands);
    const paragraph = parsed.find(element => element.tagName === 'p');
    if (!paragraph) return '';
    const within = (element: Element): boolean => {
      for (let node: Node | null = element; node && 'parentNode' in node; node = node.parentNode) if (node === paragraph) return true;
      return false;
    };
    const count = parsed.filter(element => hasClass(element, 'gl-label') && within(element)).length;
    const action = source.match(/^\/(label|unlabel|relabel)(?:\s|$)/u)?.[1];
    return count && action ? this.options.describeLabels(action === 'label' ? 'add' : action === 'unlabel' ? 'remove' : 'replace', count) : text(paragraph);
  }
  async renderDiagram(code: string, language = ''): Promise<string> {
    if (language && !/^[a-z][a-z\d_-]{0,39}$/iu.test(language)) throw new TypeError('Invalid diagram language.');
    let width = 3;
    for (const match of code.matchAll(/`+/gu)) width = Math.max(width, match[0].length);
    const fence = '`'.repeat(width + 1);
    const response = await this.render(`${fence}${language}\n${code}\n${fence}`);
    const image = this.inspect(response.body).find(element => element.tagName === 'img');
    return image ? this.safe(attr(image, 'data-src') || attr(image, 'src')) ?? '' : '';
  }
  clear(): void {
    for (const cancel of this.pending) cancel.abort();
    this.cache.clear(); this.cacheBytes = 0;
  }
  dispose(): void { this.disposed = true; this.clear(); }
}
