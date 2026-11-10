import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { readDocumentPageSettings, type Editor, type Node } from 'fountainjs-editor';
import { createPageGeometry, layoutPages, pageSettingsGeometry, projectPagePresentation } from 'fountainjs-editor/pages';
import { measureDOMPageFlow, projectDOMPageContent } from 'fountainjs-editor/pages/dom';
import { renderDOMPagePreview } from 'fountainjs-editor/pages/preview';
import type { FountainEditorHandle } from 'fountainjs-editor/react';

const unitsPerMillimetre = 96 / 25.4;
const assetWaitMilliseconds = 2_500;

function imageReady(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  if (image.complete && (image.currentSrc || image.naturalWidth)) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => resolve();
    image.addEventListener('load', finish, { once: true, signal });
    image.addEventListener('error', finish, { once: true, signal });
  });
}

function replaceUnavailableImage(image: HTMLImageElement): void {
  const placeholder = image.ownerDocument.createElement('span');
  placeholder.className = 'lab-preview-image-unavailable';
  placeholder.style.cssText = image.style.cssText;
  for (const name of ['data-fountain-path', 'data-fountain-inline-image', 'data-fountain-paragraph-layout']) {
    const value = image.getAttribute(name);
    if (value !== null) placeholder.setAttribute(name, value);
  }
  if (!placeholder.style.width && image.hasAttribute('width')) placeholder.style.width = `${image.width}px`;
  if (!placeholder.style.height && image.hasAttribute('height')) placeholder.style.height = `${image.height}px`;
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute('aria-label', image.alt ? `Image unavailable: ${image.alt}` : 'Image unavailable');
  image.removeAttribute('srcset');
  image.removeAttribute('src');
  image.replaceWith(placeholder);
}

function prepareImageFigures(source: HTMLElement): void {
  source.querySelectorAll('.fountain-image__caption-input, .fountain-image__resize-controls, .fountain-image__error')
    .forEach(control => control.remove());
  for (const caption of source.querySelectorAll('.fountain-image__caption')) {
    if (caption.querySelector('[data-fountain-image-caption-content]:not([hidden])')) continue;
    const legacy = caption.querySelector<HTMLElement>('.fountain-image__caption-text');
    if (legacy?.textContent) {
      legacy.hidden = false;
      caption.removeAttribute('hidden');
    } else caption.remove();
  }
}

function paperFor(document: Node) {
  const settings = readDocumentPageSettings(document);
  try {
    const paper = pageSettingsGeometry({ unit: 'pt', ...settings, headerDistance: undefined, footerDistance: undefined }, { unitsPerMillimetre });
    const bodyWidth = paper.size.width - paper.margins.left - paper.margins.right;
    if (paper.size.width > 4000 || paper.size.height > 4000 || bodyWidth < 64 || paper.bodyHeight < 64) {
      throw new RangeError('Document dimensions exceed this preview’s layout limits.');
    }
    return { paper, settings, note: 'Using the document’s paper size and margins.' };
  } catch (error) {
    return {
      paper: createPageGeometry({ size: 'letter', margins: 25.4, unitsPerMillimetre }),
      note: `Using Letter with 1-inch margins. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function ConversionPagePreview({ editor, document, surface }: {
  editor: Editor; document: Node; surface: RefObject<FountainEditorHandle | null>;
}) {
  const target = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [built, setBuilt] = useState<{ document: Node; pages: number; note: string; warnings: string[] }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const current = built?.document === document;

  useLayoutEffect(() => () => pending.current?.abort(), []);

  useLayoutEffect(() => {
    if (built && !current) {
      target.current?.replaceChildren();
      setBuilt(undefined);
      setMessage('The draft changed. Build the page preview again.');
    }
  }, [built, current]);

  async function build() {
    const live = surface.current?.view?.dom;
    const mount = target.current;
    if (!live || !mount || pending.current) return;
    const draft = editor.state.doc;
    const controller = new AbortController();
    const { signal } = controller;
    pending.current = controller;
    mount.replaceChildren();
    setBuilt(undefined);
    setBusy(true);
    setMessage('Measuring the draft…');
    let source: HTMLElement | undefined;
    let timeout: number | undefined;
    try {
      const { paper, settings, note } = paperFor(draft);
      const width = paper.size.width - paper.margins.left - paper.margins.right;
      source = live.cloneNode(true) as HTMLElement;
      source.setAttribute('aria-hidden', 'true');
      source.inert = true;
      source.classList.add('lab-page-measure');
      source.style.width = `${width}px`;
      prepareImageFigures(source);
      const images = Array.from(source.querySelectorAll('img'));
      images.forEach(image => { image.loading = 'eager'; });
      const imagesReady = images.map(image => imageReady(image, signal));
      mount.before(source);
      let fontsReady = false;
      const fonts = live.ownerDocument.fonts.ready.then(() => { fontsReady = true; });
      const deadline = new Promise<void>(resolve => {
        timeout = window.setTimeout(resolve, assetWaitMilliseconds);
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      await Promise.race([Promise.all([fonts, ...imagesReady]), deadline]);
      if (signal.aborted || target.current !== mount) return;
      if (editor.state.doc !== draft) throw new Error('The draft changed before measurement. Build the preview again.');
      if (!fontsReady) throw new Error('Fonts are still loading. Build the preview again once they are ready.');

      // Only measure and print the snapshot. A late image in the editor must
      // never change the geometry of pages that have already been built.
      const unavailable = images.filter(image => !image.complete || !image.naturalWidth);
      unavailable.forEach(replaceUnavailableImage);

      const measurement = measureDOMPageFlow(source, draft, { omitTrailingCaret: true });
      const furniture = (kind: 'header' | 'footer', bodyMargin: number, edgeDistance?: number) => {
        const templates = measurement.templates.filter(template => template.kind === kind);
        if (!templates.length) return { margin: bodyMargin, height: 0 };
        const margin = edgeDistance === undefined ? bodyMargin : edgeDistance * 96 / 72;
        // A template only takes body space once it extends past the body margin.
        const height = Math.max(bodyMargin - margin, ...templates.map(template => template.height));
        return { margin, height };
      };
      const header = furniture('header', paper.margins.top, settings?.headerDistance);
      const footer = furniture('footer', paper.margins.bottom, settings?.footerDistance);
      const geometry = createPageGeometry({ size: paper.size, margins: { ...paper.margins, top: header.margin, bottom: footer.margin },
        headerHeight: header.height, footerHeight: footer.height });
      const layout = layoutPages(measurement.items, geometry, { maximumPages: 150 });
      const presentation = projectPagePresentation(draft, layout);
      source.classList.remove('lab-page-measure');
      source.removeAttribute('style');
      source.removeAttribute('aria-hidden');
      source.inert = false;
      const { pages } = renderDOMPagePreview(source, mount, geometry, {
        measurement, layout, presentation, content: projectDOMPageContent(measurement, layout),
      }, { ariaLabel: 'Paged draft preview' });
      const warnings = [...measurement.warnings, ...layout.warnings, ...presentation.warnings].map(warning => warning.detail);
      if (unavailable.length) {
        const count = unavailable.length === 1 ? 'One image was' : `${unavailable.length} images were`;
        warnings.unshift(`${count} unavailable in this preview. The draft keeps the original image references. Embed a local copy to include a linked image in print.`);
      }
      const templates = measurement.templates.length ? ' Headers and footers use measured heights and any supported edge distances.' : '';
      setBuilt({ document: draft, pages: pages.length, note: note + templates, warnings });
      setMessage('');
    } catch (error) {
      if (target.current === mount) setMessage(`Preview unavailable. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      window.clearTimeout(timeout);
      controller.abort();
      if (pending.current === controller) pending.current = null;
      source?.remove();
      if (target.current === mount) setBusy(false);
    }
  }

  return <section className="lab-export lab-page-preview" aria-label="Draft pagination" data-print-ready={current}>
    <h3>Page preview</h3>
    <p>See how Fountain lays out the current draft before printing. To compare, open the untouched file in its original application.</p>
    <div className="lab-actions"><button disabled={busy} onClick={() => void build()}>Build page preview</button>
      <button disabled={!current} onClick={() => window.print()}>Print / Save PDF</button></div>
    <p className="lab-privacy">Scroll inside the preview to inspect wide pages. In the browser’s print dialog, choose Save as PDF and turn off browser headers and footers.</p>
    <p aria-live="polite">{current && built ? `${built.pages} ${built.pages === 1 ? 'page' : 'pages'}. ${built.note}` : message}</p>
    {current && built && built.warnings.length > 0 && <details><summary>{built.warnings.length} layout {built.warnings.length === 1 ? 'warning' : 'warnings'}</summary><ul>{built.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    <div className="lab-page-sheets" hidden={!current} tabIndex={current ? 0 : undefined} ref={target} />
  </section>;
}
