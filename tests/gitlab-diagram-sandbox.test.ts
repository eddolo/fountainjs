import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { prepareGitLabDiagramSandbox } from '../integrations/gitlab/services/diagram_sandbox_patch.mjs';
import { prepareGitLabMermaidReader } from '../integrations/gitlab/services/diagram_reader_patch.mjs';

const source = readFileSync(new URL('../integrations/gitlab/fixtures/mermaid-sandbox-upstream.js', import.meta.url), 'utf8');
function setup(render = vi.fn(async () => ({ svg: '<svg>current</svg>' }))) {
  const listeners = new Map<string, (event: any) => void>(), messages: any[] = [];
  const inserted: string[] = [], removed: string[] = [];
  const app = { firstElementChild: { removeAttribute: vi.fn(), getBoundingClientRect: () => ({ height: 100, width: 200 }) },
    set innerHTML(value: string) { inserted.push(value); }, textContent: '' };
  const window = { location: { origin: 'http://127.0.0.1:5080' }, parent: { postMessage: (value: unknown) => messages.push(value) },
    addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler) };
  const context: any = { window, DOMPurify: { addHook: vi.fn() }, getParameterByName: () => null,
    merge: (base: unknown) => base, resetServiceWorkersPublicPath: vi.fn(),
    document: { addEventListener: vi.fn(), getElementById: (id: string) => id === 'app' ? app : { remove: () => removed.push(id) } } };
  const prepared = prepareGitLabDiagramSandbox(source).replace(/^import .*;\n/gmu, '').replace('export function initMermaidSandbox', 'function initMermaidSandbox');
  runInNewContext(prepared + '\nglobalThis.start = initMermaidSandbox;', context);
  context.start({ initialize: vi.fn(), mermaidAPI: { render } });
  const send = (text: string, id?: number, origin = window.location.origin) => listeners.get('message')!({
    origin, data: { source: text, proxiedUrls: null, ...(id === undefined ? {} : { fountainRequestId: id }) },
  });
  return { send, render, messages, inserted, removed, app };
}
const settle = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };

it('guards the exact pinned primary-source sandbox fixture and refuses a changed boundary', () => {
  expect(createHash('sha256').update(source).digest('hex')).toBe('c174dee8be4203bea76c88778156ea5c00f976d758915c2627ec65a2f5872ab9');
  expect(() => prepareGitLabDiagramSandbox(source.replace('insertSvg(svg);', 'unknown(svg);'))).toThrow('pinned');
});
it('returns correlated dimensions from the actual transformed sandbox without weakening Mermaid configuration', async () => {
  const { send, messages, inserted, render } = setup();
  send('graph LR; A-->B', 1); await settle();
  expect(render).toHaveBeenCalledWith('fountain-mermaid-1', 'graph LR; A-->B');
  expect(inserted).toEqual(['<svg>current</svg>']);
  expect(messages).toEqual([{ h: 100, w: 200, fountainRequestId: 1 }]);
  expect(prepareGitLabDiagramSandbox(source)).toContain("securityLevel: 'strict'");
});
it('catches invalid source and reports a fixed correlated error without leaking parser HTML', async () => {
  const { send, messages, app, removed } = setup(vi.fn(async () => { throw new Error('<script>parser output</script>'); }));
  send('invalid source', 3); await settle();
  expect(messages).toEqual([{ fountainRequestId: 3, fountainDiagramError: true }]);
  expect(app.textContent).toBe(''); expect(removed).toEqual(['dfountain-mermaid-3']);
});
it('serializes rendering and prevents an older result from replacing newer source', async () => {
  let finish!: (value: { svg: string }) => void;
  const pending = new Promise<{ svg: string }>(resolve => { finish = resolve; });
  const render = vi.fn().mockReturnValueOnce(pending).mockResolvedValue({ svg: '<svg>new</svg>' });
  const { send, messages, inserted } = setup(render);
  send('old', 1); await settle(); send('new', 2); await settle();
  expect(render).toHaveBeenCalledTimes(1);
  finish({ svg: '<svg>old</svg>' }); await settle();
  expect(inserted).toEqual(['<svg>new</svg>']);
  expect(messages).toEqual([{ h: 100, w: 200, fountainRequestId: 2 }]);
});
it('ignores invalid native request IDs and foreign origins, while preserving legacy reader messages', async () => {
  const { send, render, messages } = setup();
  send('foreign', 1, 'https://example.invalid'); send('zero', 0); send('negative', -1); send('fraction', 1.5);
  await settle(); expect(render).not.toHaveBeenCalled();
  send('legacy'); await settle();
  expect(render).toHaveBeenCalledWith('mermaid', 'legacy');
  expect(messages).toEqual([{ h: 100, w: 200 }]);
});

it('reports a fixed legacy-reader failure instead of leaking an unhandled parser rejection', async () => {
  const { send, messages, app, removed } = setup(vi.fn(async () => { throw new Error('<img src=x onerror="alert(1)">'); }));
  send('invalid saved diagram'); await settle();
  expect(messages).toEqual([{ fountainDiagramError: true }]);
  expect(app.textContent).toBe(''); expect(removed).toEqual([]);
});

it('guards the exact pinned reader boundary before installing source recovery', () => {
  const reader = readFileSync(new URL('../integrations/gitlab/fixtures/mermaid-reader-upstream.js', import.meta.url), 'utf8');
  expect(createHash('sha256').update(reader).digest('hex')).toBe('3c349fe6816d139177ce6e9bc04eecbdb2a93fe72fbf345986ac483942f05786');
  expect(() => prepareGitLabMermaidReader(reader)).not.toThrow();
  expect(() => prepareGitLabMermaidReader(reader.replace('hasRendered = true;', 'hasRendered = false;'))).toThrow('pinned');
});
