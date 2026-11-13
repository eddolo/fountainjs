import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { nextTick } from 'vue';
import { setHTMLFixture, resetHTMLFixture } from 'helpers/fixtures';
import renderMermaid from '~/behaviors/markdown/render_sandboxed_mermaid';
import { PanelBreakpointInstance } from '~/panel_breakpoint_instance';

jest.mock('~/panel_breakpoint_instance', () => ({
  PanelBreakpointInstance: { addResizeListener: jest.fn(), removeResizeListener: jest.fn() },
}));

describe('Saved Mermaid failure recovery', () => {
  const source = '! ! ! INVALID\n<img src=x onerror="alert(1)">';
  const frame = () => document.querySelector('iframe');
  const pre = () => document.querySelector('pre');
  const receive = (data, origin = 'null', sender = frame().contentWindow) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: sender }));
  const settle = async () => { await nextTick(); await nextTick(); };
  beforeEach(() => {
    jest.useFakeTimers(); window.gon = { features: {} }; document.body.dataset.page = '';
    setHTMLFixture('<div class="js-markdown-code"><pre><code class="js-render-mermaid"></code></pre></div>');
    document.querySelector('code').textContent = source;
    renderMermaid([...document.querySelectorAll('code')]); jest.runAllTimers();
  });
  afterEach(() => { resetHTMLFixture(); jest.useRealTimers(); });
  it('reveals exact inert source with a fixed localized alert after its own sandbox fails', async () => {
    receive({ fountainDiagramError: true }); await settle();
    expect(getByRole(document.body, 'alert').textContent).toContain('diagram could not be rendered');
    expect(pre().textContent).toBe(source); expect(pre().classList.contains('gl-sr-only')).toBe(false);
    expect(document.querySelector('img')).toBeNull(); expect(frame().parentElement.hidden).toBe(true);
    expect(getByRole(document.body, 'button', { name: 'Retry diagram' }).textContent.trim()).toBe('Retry diagram');
  });
  it('does not duplicate failure alerts or source when repeated errors arrive', async () => {
    receive({ fountainDiagramError: true }); receive({ fountainDiagramError: true }); await settle();
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(document.querySelectorAll('pre')).toHaveLength(1); expect(pre().textContent).toBe(source);
  });
  it('retries the original source and restores a successful diagram without losing the code carrier', async () => {
    const post = jest.spyOn(frame().contentWindow, 'postMessage');
    receive({ fountainDiagramError: true }); await settle();
    fireEvent.click(getByRole(document.body, 'button', { name: 'Retry diagram' }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ source }), '*');
    receive({ h: 120, w: 200 }); await settle();
    expect(queryByRole(document.body, 'alert')).toBeNull();
    expect(frame().parentElement.hidden).toBe(false); expect(frame().height).toBe('130px');
    expect(pre().classList.contains('gl-sr-only')).toBe(true); expect(pre().textContent).toBe(source);
  });
  it.each([false, 'true', 1])('ignores a non-boolean error value %s', async fountainDiagramError => {
    receive({ fountainDiagramError }); await settle();
    expect(queryByRole(document.body, 'alert')).toBeNull(); expect(pre().classList.contains('gl-sr-only')).toBe(true);
  });
  it('ignores foreign frames/origins and native preview request messages', async () => {
    receive({ fountainDiagramError: true }, 'https://example.invalid');
    receive({ fountainDiagramError: true }, 'null', window);
    receive({ fountainDiagramError: true, fountainRequestId: 3 }); await settle();
    expect(queryByRole(document.body, 'alert')).toBeNull(); expect(pre().classList.contains('gl-sr-only')).toBe(true);
  });
  it('keeps sibling code and frames isolated from the failed diagram', async () => {
    const wrapper = document.createElement('div'); wrapper.innerHTML = '<pre><code class="js-render-mermaid">graph LR; A--&gt;B</code></pre>';
    document.body.appendChild(wrapper); renderMermaid([...wrapper.querySelectorAll('code')]); jest.runAllTimers();
    receive({ fountainDiagramError: true }); await settle();
    expect(wrapper.querySelector('pre').classList.contains('gl-sr-only')).toBe(true);
    expect(wrapper.querySelector('[role="alert"]')).toBeNull();
  });
  it('releases its error UI when the existing resize lifecycle detects a removed diagram', async () => {
    const remove = jest.spyOn(window, 'removeEventListener');
    receive({ fountainDiagramError: true }); await settle(); document.querySelector('.js-markdown-code').remove();
    const resize = PanelBreakpointInstance.addResizeListener.mock.calls.at(-1)[0]; resize(); jest.runAllTimers();
    expect(PanelBreakpointInstance.removeResizeListener).toHaveBeenCalledWith(resize);
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function), false);
    expect(queryByRole(document.body, 'alert')).toBeNull();
  });
});
