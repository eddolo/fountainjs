import type { NodeJSON } from '../../src/core';

// Independent expected geometry for legacy fixtures that specify no page setup.
// Reimport must now expose these previously implicit exporter defaults. Keep
// exact comparison of every other field; do not discard root attrs or content.
export const defaultDOCXPageSettings = {
  unit: 'pt', width: 595.3, height: 841.9,
  marginTop: 72, marginRight: 72, marginBottom: 72, marginLeft: 72,
  headerDistance: 36, footerDistance: 36, gutter: 0,
} as const;
export function withDOCXPageDefaults(document: NodeJSON, page: 'a4' | 'letter' = 'a4'): NodeJSON {
  return { ...document, attrs: { ...document.attrs, pageSettings: {
    ...defaultDOCXPageSettings, ...(page === 'letter' ? { width: 612, height: 792 } : {}), ...(document.attrs?.pageSettings as object | undefined),
  } } };
}

/** Independent expectations for the exporter fixture's published Word defaults.
 * These were previously implicit in styles.xml. Do not strip them from actual
 * results to manufacture equality; compare the full expected tree instead.
 * This helper is only for export/reimport fixtures, not arbitrary Word files.
 */
interface DOCXExportStyleContext {
  readonly definitionIndent: number;
  readonly listLevel?: number;
  readonly listContinuation?: boolean;
}

export function withDOCXExportStyles(document: NodeJSON, role = '', context: DOCXExportStyleContext = { definitionIndent: 0 }): NodeJSON {
  const block = ['paragraph', 'heading', 'code_block'].includes(document.type);
  const currentRole = document.type === 'blockquote' ? document.attrs?.appearance === 'explicit' ? '' : 'quote' : document.type === 'definition_term' ? 'term'
    : document.type === 'definition_description' ? '' : role;
  const exportedLayout = (): Record<string, unknown> | undefined => {
    if (!block) return undefined;
    const normal = {
      unit: 'pt',
      fontFamily: 'Arial',
      fontSize: 11,
      spacingBefore: 0,
      spacingAfter: 8,
      lineHeight: 1.15,
      lineHeightUnit: 'multiple',
      lineHeightRule: 'auto',
      keepWithNext: false,
      keepLinesTogether: false,
      pageBreakBefore: false,
    };
    let inherited: Record<string, unknown> = normal;
    if (document.type === 'heading') inherited = {
      ...normal,
      fontSize: [32, 26, 22, 18, 15, 13][Number(document.attrs?.level ?? 1) - 1],
      spacingBefore: Number(document.attrs?.level ?? 1) === 1 ? 18 : 12,
      keepWithNext: true,
      keepLinesTogether: true,
    };
    else if (document.type === 'code_block') inherited = {
      ...normal,
      fontFamily: 'Consolas',
      fontSize: 10,
      spacingBefore: 6,
      background: '#f2eff8',
    };
    else if (currentRole === 'quote') inherited = {
      ...normal,
      spacingBefore: 8,
      spacingAfter: 10,
      indentStart: 18,
      indentEnd: 18,
      borders: { left: { style: 'solid', color: '#7047ff', width: 2.25, space: 12 } },
    };
    else if (currentRole === 'term') inherited = { ...normal, keepWithNext: true };
    const generatedIndent = context.definitionIndent + (context.listLevel === undefined ? 0 : 36 * (context.listLevel + 1));
    if (generatedIndent && document.attrs?.layout === undefined) inherited = { ...inherited, indentStart: generatedIndent };
    else if (generatedIndent && (document.attrs?.layout as Record<string, unknown>).indentStart === undefined) inherited = { ...inherited, indentStart: generatedIndent };
    if (context.listLevel !== undefined && !context.listContinuation
      && (document.attrs?.layout as Record<string, unknown> | undefined)?.hangingIndent === undefined) {
      inherited = { ...inherited, hangingIndent: 18 };
    }
    // The generated Word stylesheet supplies presentation defaults and direct
    // Fountain layout overrides them property by property. Reimport correctly
    // materializes that complete effective appearance, so fixtures must compare
    // against the full expected tree rather than erase the newly visible data.
    return { ...inherited, ...(document.attrs?.layout as Record<string, unknown> | undefined) };
  };
  const visitInline = (node: NodeJSON): NodeJSON => {
    if (!['text', 'footnote_reference', 'page_field'].includes(node.type)) return node;
    const marks = new Map((node.marks ?? []).map(mark => [mark.type, mark]));
    const put = (type: string, attrs?: Record<string, string>) => { if (!marks.has(type)) marks.set(type, { type, ...(attrs ? { attrs } : {}) }); };
    put('font_family', { family: String((document.attrs?.layout as Record<string, unknown> | undefined)?.fontFamily
      ?? (document.type === 'code_block' || marks.has('code') ? 'Consolas' : 'Arial')) });
    put('font_size', { size: `${(document.attrs?.layout as Record<string, unknown> | undefined)?.fontSize
      ?? (document.type === 'heading' ? [32, 26, 22, 18, 15, 13][Number(document.attrs?.level ?? 1) - 1] : document.type === 'code_block' ? 10 : 11)}pt` });
    if (document.type === 'heading') put('text_color', { color: '#181426' });
    if (currentRole === 'quote') put('text_color', { color: '#51476a' });
    if (document.attrs?.emphasis !== 'explicit' && (document.type === 'heading' || currentRole === 'term')) put('strong');
    // Character pitch is retained between the native font declarations and
    // emphasis. Keep it in the explicit order rather than sorting an unknown
    // type before all fonts; this preserves the full mark array/attributes.
    const order = ['font_family', 'font_size', 'letter_spacing', 'strong', 'em', 'underline', 'strike', 'code', 'text_color', 'highlight', 'link'];
    return { ...node, marks: [...marks.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)) };
  };
  const layout = exportedLayout();
  const children = document.content?.map((child, index) => {
    if (block) return visitInline(child);
    if (document.type === 'definition_list') {
      const term = child.type === 'definition_term';
      return withDOCXExportStyles(child, term ? 'term' : '', {
        ...context,
        definitionIndent: context.definitionIndent + (term ? 0 : 18),
      });
    }
    if (document.type === 'bullet_list' || document.type === 'ordered_list') {
      return withDOCXExportStyles(child, currentRole, { ...context, listLevel: context.listLevel ?? 0 });
    }
    if (document.type === 'list_item') {
      const nested = child.type === 'bullet_list' || child.type === 'ordered_list';
      return withDOCXExportStyles(child, currentRole, nested
        ? { ...context, listLevel: Math.min(8, (context.listLevel ?? 0) + 1), listContinuation: false }
        : { ...context, listContinuation: index > 0 });
    }
    return withDOCXExportStyles(child, currentRole, context);
  });
  return { ...document,
    ...(document.type === 'blockquote' ? { attrs: { ...document.attrs, appearance: 'explicit' } } : {}),
    ...(block ? { attrs: { ...document.attrs, ...(layout ? { layout } : {}),
      ...(document.type !== 'code_block' ? { emphasis: 'explicit' } : {}) } } : {}),
    ...(children ? { content: children } : {}),
  };
}

/** Materialize the native Word grid emitted by the exporter. The grid is a
 * document-level column decision: the first valid width in document order wins
 * and columns without one receive the exporter's 160px default. */
export function withDOCXExportTableWidths(document: NodeJSON): NodeJSON {
  const visit = (node: NodeJSON): NodeJSON => {
    if (node.type !== 'table') {
      return { ...node, ...(node.content ? { content: node.content.map(visit) } : {}) };
    }
    const occupied: boolean[][] = Array.from({ length: node.content?.length ?? 0 }, () => []);
    const placements = new Map<string, { column: number; colspan: number }>();
    let width = 0;
    for (const [rowIndex, row] of (node.content ?? []).entries()) {
      let column = 0;
      for (const [cellIndex, cell] of (row.content ?? []).entries()) {
        const colspan = Math.max(1, Number(cell.attrs?.colspan) || 1);
        const rowspan = Math.max(1, Number(cell.attrs?.rowspan) || 1);
        while (occupied[rowIndex]?.[column]) column += 1;
        placements.set(`${rowIndex}:${cellIndex}`, { column, colspan });
        for (let rowOffset = 0; rowOffset < rowspan && rowIndex + rowOffset < occupied.length; rowOffset += 1) {
          for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
            occupied[rowIndex + rowOffset]![column + columnOffset] = true;
          }
        }
        width = Math.max(width, column + colspan);
        column += colspan;
      }
    }
    const candidates: number[][] = Array.from({ length: Math.max(1, width) }, () => []);
    for (const [rowIndex, row] of (node.content ?? []).entries()) {
      for (const [cellIndex, cell] of (row.content ?? []).entries()) {
        const placement = placements.get(`${rowIndex}:${cellIndex}`)!;
        const widths = Array.isArray(cell.attrs?.colwidth) ? cell.attrs.colwidth.map(Number) : [];
        for (let offset = 0; offset < placement.colspan; offset += 1) {
          const value = widths[offset];
          if (Number.isInteger(value) && value >= 40 && value <= 2_000) candidates[placement.column + offset]!.push(value);
        }
      }
    }
    const columns = candidates.map(values => values[0] ?? 160);
    return {
      ...node,
      attrs: { ...node.attrs, preferredWidth: node.attrs?.preferredWidth ?? (node.attrs?.layout === 'fixed' && candidates.every(values => values.length > 0)
        ? { unit: 'pt', value: columns.reduce((sum, width) => sum + width, 0) * 0.75 } : { unit: 'percent', value: 100 }), appearance: node.attrs?.appearance ?? {
        unit: 'pt',
        borders: {
          top: { style: 'solid', width: 0.75, color: '#c9c2d8' },
          left: { style: 'solid', width: 0.75, color: '#c9c2d8' },
          bottom: { style: 'solid', width: 0.75, color: '#c9c2d8' },
          right: { style: 'solid', width: 0.75, color: '#c9c2d8' },
          insideH: { style: 'solid', width: 0.75, color: '#d9d3e5' },
          insideV: { style: 'solid', width: 0.75, color: '#d9d3e5' },
        },
        padding: { top: 5, left: 6, bottom: 5, right: 6 },
      } },
      content: (node.content ?? []).map((row, rowIndex) => ({
        ...row,
        attrs: { ...row.attrs, repeatHeader: row.attrs?.repeatHeader ??
          Boolean(row.content?.length && row.content.every(cell => cell.type === 'table_header')) },
        content: (row.content ?? []).map((cell, cellIndex) => {
          const placement = placements.get(`${rowIndex}:${cellIndex}`)!;
          return visit({
            ...cell,
            attrs: { ...cell.attrs, colwidth: columns.slice(placement.column, placement.column + placement.colspan) },
          });
        }),
      })),
    };
  };
  return visit(document);
}

export function withDOCXExportDefaults(document: NodeJSON, page: 'a4' | 'letter' = 'a4'): NodeJSON {
  return withDOCXPageDefaults(withDOCXExportTableWidths(withDOCXExportStyles(document)), page);
}
