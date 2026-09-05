import type { Node } from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import type {
  PageFootnoteMeasurement,
  PageLayoutResult,
  PagePlacement,
} from './layout';
import {
  inspectPageTemplates,
  resolvePageField,
  type PageFieldKind,
  type PageTemplateKind,
  type PageTemplateOccurrence,
  type PageTemplateVariant,
} from './templates';

export interface ProjectedPageField {
  readonly kind: PageFieldKind;
  readonly path: readonly number[];
  readonly value: string;
}

export interface ProjectedPageTemplate {
  readonly kind: PageTemplateKind;
  readonly variant: PageTemplateVariant;
  /** Path of the one canonical editable template in document JSON. */
  readonly sourcePath: readonly number[];
  readonly source: Node;
  readonly fields: readonly ProjectedPageField[];
}

export interface ProjectedPageFootnote extends PageFootnoteMeasurement {
  /** Path of the one canonical editable definition in document JSON. */
  readonly sourcePath: readonly number[];
  readonly source: Node;
}

export interface PagePresentationPage {
  readonly number: number;
  readonly pageCount: number;
  readonly placements: readonly PagePlacement[];
  readonly header?: ProjectedPageTemplate;
  readonly footer?: ProjectedPageTemplate;
  readonly footnotes: readonly ProjectedPageFootnote[];
  readonly usedHeight: number;
  readonly availableHeight: number;
}

export type PagePresentationWarningCode =
  | 'invalid-template-contract'
  | 'duplicate-footnote-definition'
  | 'missing-footnote-definition';

export interface PagePresentationWarning {
  readonly code: PagePresentationWarningCode;
  readonly pageNumber?: number;
  readonly id?: string;
  readonly detail: string;
}

export interface PagePresentation {
  readonly pageCount: number;
  readonly pages: readonly PagePresentationPage[];
  readonly warnings: readonly PagePresentationWarning[];
}

interface FootnoteDefinition {
  readonly id: string;
  readonly path: readonly number[];
  readonly node: Node;
}

function frozenPath(path: readonly number[]): readonly number[] {
  return Object.freeze([...path]);
}

function variantPriority(pageNumber: number): readonly PageTemplateVariant[] {
  if (pageNumber === 1) return Object.freeze(['first', 'odd', 'default']);
  return pageNumber % 2 === 0
    ? Object.freeze(['even', 'default'])
    : Object.freeze(['odd', 'default']);
}

function selectTemplate(
  templates: readonly PageTemplateOccurrence[],
  kind: PageTemplateKind,
  pageNumber: number,
): PageTemplateOccurrence | undefined {
  const matching = templates.filter((template) => template.kind === kind && template.path.length === 1);
  for (const variant of variantPriority(pageNumber)) {
    const found = matching.filter((template) => template.variant === variant);
    if (found.length === 1) return found[0];
    if (found.length > 1) return undefined;
  }
  return undefined;
}

function projectTemplate(
  document: Node,
  occurrence: PageTemplateOccurrence | undefined,
  pageNumber: number,
  pageCount: number,
): ProjectedPageTemplate | undefined {
  if (!occurrence) return undefined;
  const source = getNodeAtPath(document, occurrence.path);
  const fields: ProjectedPageField[] = [];
  source.descendants((node, path) => {
    if (node.type.name !== 'page_field') return;
    const kind = node.attrs.kind as PageFieldKind;
    fields.push(Object.freeze({
      kind,
      path: frozenPath([...occurrence.path, ...path]),
      value: resolvePageField(kind, pageNumber, pageCount),
    }));
  });
  return Object.freeze({
    kind: occurrence.kind,
    variant: occurrence.variant,
    sourcePath: frozenPath(occurrence.path),
    source,
    fields: Object.freeze(fields),
  });
}

function footnoteDefinitions(document: Node): readonly FootnoteDefinition[] {
  const definitions: FootnoteDefinition[] = [];
  document.content.forEach((node, index) => {
    if (node.type.name !== 'footnote_definition') return;
    definitions.push(Object.freeze({
      id: String(node.attrs.id),
      path: Object.freeze([index]),
      node,
    }));
  });
  return Object.freeze(definitions);
}

/**
 * Converts neutral pagination output and canonical document intent into an
 * immutable page-by-page presentation plan. It never clones or changes model
 * content; DOM/native/print renderers decide how to project these references.
 */
export function projectPagePresentation(document: Node, layout: PageLayoutResult): PagePresentation {
  if (!document || !layout || !layout.pages || !Array.isArray(layout.pages)) {
    throw new TypeError('projectPagePresentation requires a document and page layout result.');
  }
  const layoutPages = layout.pages as PageLayoutResult['pages'];
  const pageCount = layoutPages.length;
  if (pageCount < 1) throw new TypeError('A page presentation requires at least one layout page.');

  const warnings: PagePresentationWarning[] = [];
  const templateReport = inspectPageTemplates(document);
  if (!templateReport.valid) warnings.push(Object.freeze({
    code: 'invalid-template-contract',
    detail: templateReport.issues.map((issue) => issue.detail).join(' '),
  }));

  const definitions = footnoteDefinitions(document);
  const definitionsById = new Map<string, readonly FootnoteDefinition[]>();
  definitions.forEach((definition) => {
    definitionsById.set(definition.id, Object.freeze([
      ...(definitionsById.get(definition.id) ?? []),
      definition,
    ]));
  });
  definitionsById.forEach((matches, id) => {
    if (matches.length < 2) return;
    warnings.push(Object.freeze({
      code: 'duplicate-footnote-definition',
      id,
      detail: `Footnote ${id} has ${matches.length} top-level definitions; no repeated projection was selected.`,
    }));
  });

  const pages = layoutPages.map((page, pageIndex) => {
    if (page.number !== pageIndex + 1) {
      throw new TypeError('Layout page numbers must be sequential and one-based.');
    }
    const projectedFootnotes: ProjectedPageFootnote[] = [];
    page.footnotes.forEach((footnote) => {
      const matches = definitionsById.get(footnote.id) ?? [];
      if (matches.length !== 1) {
        if (matches.length === 0) warnings.push(Object.freeze({
          code: 'missing-footnote-definition',
          id: footnote.id,
          pageNumber: page.number,
          detail: `Page ${page.number} reserves footnote ${footnote.id}, but no top-level definition exists.`,
        }));
        return;
      }
      const definition = matches[0] as FootnoteDefinition;
      projectedFootnotes.push(Object.freeze({
        id: footnote.id,
        height: footnote.height,
        sourcePath: frozenPath(definition.path),
        source: definition.node,
      }));
    });
    const header = projectTemplate(
      document,
      selectTemplate(templateReport.templates, 'header', page.number),
      page.number,
      pageCount,
    );
    const footer = projectTemplate(
      document,
      selectTemplate(templateReport.templates, 'footer', page.number),
      page.number,
      pageCount,
    );
    return Object.freeze({
      number: page.number,
      pageCount,
      placements: Object.freeze([...page.placements]),
      ...(header ? { header } : {}),
      ...(footer ? { footer } : {}),
      footnotes: Object.freeze(projectedFootnotes),
      usedHeight: page.usedHeight,
      availableHeight: page.availableHeight,
    });
  });

  return Object.freeze({
    pageCount,
    pages: Object.freeze(pages),
    warnings: Object.freeze(warnings),
  });
}
