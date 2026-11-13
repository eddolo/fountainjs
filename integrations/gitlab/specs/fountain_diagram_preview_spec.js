import { nextTick } from 'vue';
import { getByRole, queryByRole, fireEvent } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import { openLinkFromMessage } from '~/behaviors/markdown/render_sandboxed_mermaid';
import FountainDiagramPreview from '~/content_editor/components/fountain_diagram_preview.vue';

jest.mock('~/behaviors/markdown/render_sandboxed_mermaid', () => ({
  getSandboxFrameSrc: () => '/-/sandbox/mermaid',
  getIframeHeightFromMessage: data => Number.isFinite(data?.h) ? data.h + 10 : null,
  openLinkFromMessage: jest.fn(), BUFFER_IFRAME_HEIGHT: 10, SANDBOX_ATTRIBUTES: 'allow-scripts',
}));
describe('FountainDiagramPreview', () => {
  let wrapper;
  let renderDiagram;
  const settle = () => Array.from({ length: 8 }).reduce(pending => pending.then(() => nextTick()), Promise.resolve());
  const frame = () => wrapper.find('iframe').element;
  const send = data => window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: frame().contentWindow, data }));
  const requestId = () => wrapper.vm.request;
  const create = async (props = {}) => {
    renderDiagram = jest.fn().mockResolvedValue('');
    wrapper = mountExtended(FountainDiagramPreview, { propsData: {
      contentEditor: { renderDiagram: (...args) => renderDiagram(...args) },
      language: 'mermaid', source: 'graph LR; A-->B', ...props,
    }, attachTo: document.body });
    await settle();
  };
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { wrapper?.destroy(); jest.useRealTimers(); });

  it('uses a titled script-only sandbox and correlated source messages', async () => {
    await create();
    expect(frame().getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame().getAttribute('title')).toBe('Mermaid diagram preview');
    const post = jest.spyOn(frame().contentWindow, 'postMessage');
    fireEvent.load(frame()); await settle();
    expect(post).toHaveBeenCalledWith({ source: 'graph LR; A-->B', proxiedUrls: null, fountainRequestId: requestId() }, '*');
    send({ h: 100, fountainRequestId: requestId() }); await settle();
    expect(wrapper.attributes('aria-busy')).toBe('false');
    expect(frame().getAttribute('height')).toBe('110');
    expect(renderDiagram).not.toHaveBeenCalled();
  });
  it('ignores foreign origin/source, stale request IDs and invalid heights', async () => {
    await create();
    for (const event of [
      { origin: 'https://example.invalid', source: frame().contentWindow, data: { h: 100, fountainRequestId: requestId() } },
      { origin: 'null', source: window, data: { h: 100, fountainRequestId: requestId() } },
      { origin: 'null', source: frame().contentWindow, data: { h: 100, fountainRequestId: requestId() - 1 } },
    ]) window.dispatchEvent(new MessageEvent('message', event));
    send({ h: Infinity, fountainRequestId: requestId() }); send({ h: 20000, fountainRequestId: requestId() });
    await settle(); expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(frame().getAttribute('height')).toBe('10');
  });
  it('reports invalid syntax, retains source and retries with a new request ID', async () => {
    await create(); const first = requestId();
    send({ fountainRequestId: first, fountainDiagramError: true }); await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('editable source is retained');
    expect(wrapper.props('source')).toBe('graph LR; A-->B');
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Retry diagram preview' })); await settle();
    expect(requestId()).toBeGreaterThan(first);
    send({ fountainRequestId: first, fountainDiagramError: true });
    send({ h: 80, fountainRequestId: requestId() }); await settle();
    expect(queryByRole(wrapper.element, 'alert')).toBeNull();
    expect(wrapper.attributes('aria-busy')).toBe('false');
  });
  it('debounces source updates, invalidates old responses immediately and bounds unresponsive previews', async () => {
    await create(); const first = requestId();
    await wrapper.setProps({ source: 'graph LR; B-->C' }); await settle();
    send({ h: 80, fountainRequestId: first }); await settle();
    expect(wrapper.attributes('aria-busy')).toBe('true');
    jest.advanceTimersByTime(250); await settle();
    jest.advanceTimersByTime(15000); await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('could not be rendered');
    expect(wrapper.props('source')).toBe('graph LR; B-->C');
    const expired = requestId() - 1;
    send({ h: 80, fountainRequestId: expired }); await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('could not be rendered');
  });
  it('only forwards valid current-frame links after a preview is ready', async () => {
    await create(); openLinkFromMessage.mockClear();
    send({ href: 'https://example.com', fountainRequestId: requestId() });
    expect(openLinkFromMessage).not.toHaveBeenCalled();
    send({ h: 90, fountainRequestId: requestId() }); await settle();
    send({ href: 'https://example.com', fountainRequestId: requestId() });
    expect(openLinkFromMessage).toHaveBeenCalledWith({ href: 'https://example.com', fountainRequestId: requestId() });
  });
  it('explains a missing PlantUML service and recovers when the real provider returns an image', async () => {
    await create({ language: 'plantuml', source: '@startuml\nA->B\n@enduml' });
    expect(renderDiagram).toHaveBeenCalledWith('@startuml\nA->B\n@enduml', 'plantuml');
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('configured diagram service');
    renderDiagram.mockResolvedValue('/diagram.svg');
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Retry diagram preview' })); await settle();
    const image = getByRole(wrapper.element, 'img');
    expect(image.getAttribute('src')).toBe('/diagram.svg');
    fireEvent.load(image); await settle(); expect(wrapper.attributes('aria-busy')).toBe('false');
    fireEvent.error(image); await settle(); expect(getByRole(wrapper.element, 'alert').textContent).toContain('could not be rendered');
  });
  it('ignores a late PlantUML response after the source changes', async () => {
    let old;
    const pending = new Promise(resolve => { old = resolve; });
    await create({ language: 'plantuml' });
    renderDiagram.mockReturnValueOnce(pending).mockResolvedValueOnce('/new.svg');
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Retry diagram preview' })); await settle();
    await wrapper.setProps({ source: '@startuml\nnew\n@enduml' });
    jest.advanceTimersByTime(250); await settle();
    old('/old.svg'); await settle();
    expect(getByRole(wrapper.element, 'img').getAttribute('src')).toBe('/new.svg');
  });
  it('cleans up queued previews, deadlines and message observers on destruction', async () => {
    await create(); const remove = jest.spyOn(window, 'removeEventListener');
    const id = requestId(); wrapper.destroy();
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function));
    jest.advanceTimersByTime(20000); await settle();
    expect(wrapper.vm.request).toBeGreaterThan(id);
  });
});
