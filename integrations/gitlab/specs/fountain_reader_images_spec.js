import { prepareFountainReaderImages } from '~/behaviors/markdown/fountain_reader_images';
import LazyLoader, { placeholderImage } from '~/lazy_loader';

describe('Reader lazy-image loading geometry', () => {
  const image = ({ complete = false, loading = 'lazy', attrs = {} } = {}) => {
    const element = document.createElement('img'); element.setAttribute('loading', loading);
    Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
    Object.defineProperty(element, 'complete', { configurable: true, value: complete });
    return element;
  };
  it('reserves pending geometry and restores the exact authored attributes/classes on load', () => {
    const element = image({ attrs: { src: '/real-figure.png', alt: 'Figure', class: 'authored gl-min-w-7' } });
    const before = element.outerHTML;
    prepareFountainReaderImages([element]);
    expect(element.classList.contains('!gl-min-h-7')).toBe(true);
    expect(element.dataset.fountainReaderImagePending).toBe('');
    expect(element.getAttribute('src')).toBe('/real-figure.png');
    element.dispatchEvent(new Event('load')); expect(element.outerHTML).toBe(before);
  });
  it('releases pending state on an error without changing the original URL or dimensions', () => {
    const element = image({ attrs: { src: '/offline.png' } }); const before = element.outerHTML;
    prepareFountainReaderImages([element]); element.dispatchEvent(new Event('error'));
    expect(element.outerHTML).toBe(before);
  });
  it.each([{ width: '1' }, { height: '1' }, { width: '300', height: '200' }])('preserves explicit sizes %j', attrs => {
    const element = image({ attrs }); const before = element.outerHTML;
    prepareFountainReaderImages([element]); expect(element.outerHTML).toBe(before);
  });
  it.each([{ complete: true }, { loading: 'eager' }])('leaves already complete or eager images unchanged: %j', options => {
    const element = image(options); const before = element.outerHTML;
    prepareFountainReaderImages([element]); expect(element.outerHTML).toBe(before);
  });
  it('does not install duplicate pending listeners and can prepare a later image load', () => {
    const element = image(); const add = jest.spyOn(element, 'addEventListener');
    prepareFountainReaderImages([element]); prepareFountainReaderImages([element]);
    expect(add).toHaveBeenCalledTimes(2);
    element.dispatchEvent(new Event('load')); prepareFountainReaderImages([element]);
    expect(add).toHaveBeenCalledTimes(4); expect(element.dataset.fountainReaderImagePending).toBe('');
    element.dispatchEvent(new Event('error')); expect(element.dataset.fountainReaderImagePending).toBeUndefined();
  });
  it('reserves space at the real placeholder-to-source transition even when the placeholder is already decoded', () => {
    const container = document.createElement('div'); container.className = 'md';
    container.innerHTML = '<a href="/figure.png"><img class="lazy" data-src="/figure.png" alt="Figure"></a>';
    const element = container.querySelector('img'); element.setAttribute('src', placeholderImage);
    Object.defineProperty(element, 'complete', { get: () => element.getAttribute('src') === placeholderImage });
    LazyLoader.loadImage(element);
    expect(element.getAttribute('src')).toBe('/figure.png');
    expect(element.dataset.fountainReaderImagePending).toBe('');
    element.dispatchEvent(new Event('load'));
    expect(element.dataset.fountainReaderImagePending).toBeUndefined();
  });
  it('does not add reader sizing to lazy-loaded images outside document content', () => {
    const container = document.createElement('div');
    container.innerHTML = '<img class="lazy" data-src="/figure.png">';
    const element = container.querySelector('img'); Object.defineProperty(element, 'complete', { value: false });
    LazyLoader.loadImage(element);
    expect(element.getAttribute('src')).toBe('/figure.png');
    expect(element.dataset.fountainReaderImagePending).toBeUndefined();
  });
});
