import type { Editor } from '../core/editor';
import { isDocumentPageSettings, type DocumentPageSettings } from '../core/page-settings';
import { createPageGeometry, type PageGeometry, type PageGeometryOptions } from './layout';

/** Changes only the root page settings using ordinary transactions/history. */
export function setDocumentPageSettings(editor: Editor, settings: DocumentPageSettings | null): boolean {
  if (!editor.editable || (settings !== null && !isDocumentPageSettings(settings))) return false;
  return editor.dispatch(editor.state.createTransaction().setNodeAttrs([], { pageSettings: settings }));
}

/** Opt-in bridge to the existing measured Pages layout, not a Word renderer.
 * Header/footer distances are placement offsets, NOT reserved content heights.
 * This geometry cannot honour those offsets, gutters or negative margins yet.
 * Reject them instead of producing a misleading layout.
 */
export function pageSettingsGeometry(settings: DocumentPageSettings, options: Pick<PageGeometryOptions, 'unitsPerMillimetre'> = {}): PageGeometry {
  if (!isDocumentPageSettings(settings)) throw new TypeError('Invalid document pageSettings.');
  if (settings.headerDistance || settings.footerDistance || settings.gutter || (settings.marginTop ?? 0) < 0 || (settings.marginBottom ?? 0) < 0) {
    throw new TypeError('Pages geometry cannot yet represent header/footer distances, gutters or negative margins.');
  }
  const required = ['width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const;
  if (required.some(key => settings[key] === undefined)) throw new TypeError('Pages geometry requires explicit size and all four margins.');
  if (settings.width! <= settings.marginLeft! + settings.marginRight!) throw new TypeError('Page margins leave no positive body width.');
  const mm = (points: number) => points * 25.4 / 72;
  return createPageGeometry({ ...options,
    size: { width: mm(settings.width!), height: mm(settings.height!) },
    margins: { top: mm(settings.marginTop!), right: mm(settings.marginRight!), bottom: mm(settings.marginBottom!), left: mm(settings.marginLeft!) },
  });
}
