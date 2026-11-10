import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { readDocumentPageSettings, type Editor, type Node } from 'fountainjs-editor';
import { createPageGeometry, layoutPages, pageSettingsGeometry, projectPagePresentation } from 'fountainjs-editor/pages';
import { measureDOMPageFlow, projectDOMPageContent } from 'fountainjs-editor/pages/dom';
import { renderDOMPagePreview } from 'fountainjs-editor/pages/preview';
import type { FountainEditorHandle } from 'fountainjs-editor/react';

const unitsPerMillimetre = 96 / 25.4;

function paperFor(document: Node) {
  const settings = readDocumentPageSettings(document);
  try {
    const paper = pageSettingsGeometry({ unit: 'pt', ...settings, headerDistance: undefined, footerDistance: undefined }, { unitsPerMillimetre });
    const bodyWidth = paper.size.width - paper.margins.left - paper.margins.right;
    if (paper.size.width > 4000 || paper.size.height > 4000 || bodyWidth < 64 || paper.bodyHeight < 64) {
      throw new RangeError('Document dimensions exceed this preview’s layout limits.');
    }
    return { paper, note: 'Using the document’s paper size and margins.' };
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
  const [built, setBuilt] = useState<{ document: Node; pages: number; note: string; warnings: string[] }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const current = built?.document === document;

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
    if (!live || !mount) return;
    const draft = editor.state.doc;
    mount.replaceChildren();
    setBuilt(undefined);
    setBusy(true);
    setMessage('Measuring the draft…');
    let source: HTMLElement | undefined;
    try {
      const { paper, note } = paperFor(draft);
      const width = paper.size.width - paper.margins.left - paper.margins.right;
      source = live.cloneNode(true) as HTMLElement;
      source.setAttribute('aria-hidden', 'true');
      source.inert = true;
      source.classList.add('lab-page-measure');
      source.style.width = `${width}px`;
      const images = Array.from(source.querySelectorAll('img'));
      images.forEach(image => { image.loading = 'eager'; });
      mount.before(source);
      await Promise.all([live.ownerDocument.fonts.ready, ...images.map(image => image.decode().catch(() => undefined))]);
      if (target.current !== mount) return;
      if (editor.state.doc !== draft) throw new Error('The draft changed before measurement. Build the preview again.');

      const measurement = measureDOMPageFlow(source, draft);
      const templateHeight = (kind: 'header' | 'footer') => Math.max(0, ...measurement.templates.filter(template => template.kind === kind).map(template => template.height));
      const geometry = createPageGeometry({ size: paper.size, margins: paper.margins,
        headerHeight: templateHeight('header'), footerHeight: templateHeight('footer') });
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
      const templates = measurement.templates.length ? ' Headers and footers use their measured heights. Original offsets may differ.' : '';
      setBuilt({ document: draft, pages: pages.length, note: note + templates, warnings });
      setMessage('');
    } catch (error) {
      if (target.current === mount) setMessage(`Preview unavailable. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
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
    {current && built && built.warnings.length > 0 && <details><summary>{built.warnings.length} layout warnings</summary><ul>{built.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    <div className="lab-page-sheets" hidden={!current} tabIndex={current ? 0 : undefined} ref={target} />
  </section>;
}
