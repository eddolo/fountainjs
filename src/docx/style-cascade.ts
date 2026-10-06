/** Internal, DOM-free Word run-style cascade used by importDOCX.
 * XML decoding/validation and projection into editable Fountain marks are separate
 * boundaries. In particular, false is not the same thing as an absent mark.
 */
export const WORD_TOGGLES = ['bold', 'italic', 'strike', 'caps', 'smallCaps', 'outline', 'shadow', 'emboss', 'imprint', 'vanish', 'boldCS', 'italicCS'] as const;
export type WordToggle = typeof WORD_TOGGLES[number];
export const WORD_FONT_SLOTS = ['ascii', 'hAnsi', 'eastAsia', 'cs'] as const;
export type WordFontSlot = typeof WORD_FONT_SLOTS[number];

export interface WordFontDeclaration {
  readonly name?: string;
  readonly theme?: string;
}
export interface WordRunFormatting {
  readonly toggles?: Readonly<Partial<Record<WordToggle, boolean>>>;
  /** Half-points stay in source units until the Fountain projection boundary. */
  readonly size?: number;
  readonly sizeCS?: number;
  /** Signed twentieths of a point. Zero explicitly resets inherited pitch. */
  readonly characterSpacing?: number;
  /** 'auto' and 'none' are explicit values, not missing declarations. */
  readonly color?: string;
  readonly highlight?: string;
  readonly underline?: string;
  readonly verticalAlign?: string;
  readonly fonts?: Readonly<Partial<Record<WordFontSlot, WordFontDeclaration>>>;
}
export const WORD_PARAGRAPH_BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type WordParagraphBorderSide = typeof WORD_PARAGRAPH_BORDER_SIDES[number];
export interface WordParagraphBorder {
  readonly value: string;
  /** Eighths of a point. */
  readonly size?: number;
  /** Whole points between text and border. */
  readonly space?: number;
  readonly color?: string;
}
export interface WordParagraphFormatting {
  readonly align?: string;
  /** Twentieths of a point, except auto line spacing which is 240ths of a line. */
  readonly spacingBefore?: number;
  readonly spacingAfter?: number;
  readonly line?: number;
  readonly lineRule?: 'auto' | 'exact' | 'atLeast';
  /** Twentieths of a point. */
  readonly indentLeft?: number;
  readonly indentRight?: number;
  readonly firstLine?: number | null;
  readonly hanging?: number | null;
  readonly keepNext?: boolean;
  readonly keepLines?: boolean;
  readonly pageBreakBefore?: boolean;
  readonly background?: string | null;
  readonly borders?: Readonly<Partial<Record<WordParagraphBorderSide, WordParagraphBorder | null>>>;
}
export interface WordStyleDefinition {
  readonly id: string;
  readonly kind: 'paragraph' | 'character';
  readonly basedOn?: string;
  readonly isDefault?: boolean;
  readonly run?: WordRunFormatting;
  readonly paragraph?: WordParagraphFormatting;
}
/** Effective table declarations precede paragraph/character styles. Unlike
 * ordinary style toggles, Word table toggle declarations are absolute resets.
 */
export interface WordTableTextFormatting {
  readonly runs: readonly WordRunFormatting[];
  readonly paragraphs: readonly WordParagraphFormatting[];
}
export interface ResolvedWordParagraph {
  readonly formatting: WordParagraphFormatting;
  readonly paragraphChain: readonly string[];
  readonly issues: readonly WordStyleIssue[];
}
export interface WordStyleIssue {
  readonly code: 'missing-style' | 'wrong-style-kind' | 'style-cycle' | 'style-depth-limit' | 'word-default-toggle-unverified';
  readonly styleId?: string;
  readonly property?: WordToggle;
}
export interface ResolvedWordRun {
  readonly formatting: Omit<WordRunFormatting, 'toggles'> & {
    /** Uncertain Word-specific default-toggle combinations must not become false. */
    readonly toggles: Readonly<Partial<Record<WordToggle, boolean | 'unresolved'>>>;
  };
  readonly paragraphChain: readonly string[];
  readonly characterChain: readonly string[];
  readonly issues: readonly WordStyleIssue[];
}

const VALUE_KEYS = ['size', 'sizeCS', 'characterSpacing', 'color', 'highlight', 'underline', 'verticalAlign'] as const;
type MutableFormatting = {
  -readonly [K in keyof Omit<WordRunFormatting, 'toggles' | 'fonts'>]: WordRunFormatting[K]
} & {
  toggles: Partial<Record<WordToggle, boolean | 'unresolved'>>;
  fonts: Partial<Record<WordFontSlot, WordFontDeclaration>>;
};

function own<T extends object, K extends keyof T>(value: T | undefined, key: K): T[K] | undefined {
  return value && Object.hasOwn(value, key) ? value[key] : undefined;
}

function copyFormatting(input: WordRunFormatting = {}): WordRunFormatting {
  const toggles: Partial<Record<WordToggle, boolean>> = {};
  const fonts: Partial<Record<WordFontSlot, WordFontDeclaration>> = {};
  const result: { -readonly [K in keyof WordRunFormatting]: WordRunFormatting[K] } = {};
  for (const key of WORD_TOGGLES) {
    const value = own(own(input, 'toggles'), key);
    if (value !== undefined) {
      if (typeof value !== 'boolean') throw new Error(`Invalid Word toggle ${key}.`);
      toggles[key] = value;
    }
  }
  for (const slot of WORD_FONT_SLOTS) {
    const value = own(own(input, 'fonts'), slot);
    if (!value) continue;
    const name = own(value, 'name'); const theme = own(value, 'theme');
    if ([name, theme].some(item => item !== undefined && (typeof item !== 'string' || !item || item.length > 320))) {
      throw new Error(`Invalid Word font declaration ${slot}.`);
    }
    // An empty rFonts attribute group does not clear an inherited font.
    if (theme !== undefined) fonts[slot] = Object.freeze({ theme, ...(name === undefined ? {} : { name }) });
    else if (name !== undefined) fonts[slot] = Object.freeze({ name });
  }
  for (const key of VALUE_KEYS) {
    const value = own(input, key);
    if (value === undefined) continue;
    if (key === 'size' || key === 'sizeCS' || key === 'characterSpacing') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || (key !== 'characterSpacing' && value <= 0)) throw new Error(`Invalid Word ${key}.`);
      result[key] = value;
    } else {
      if (typeof value !== 'string' || !value || value.length > 320) throw new Error(`Invalid Word ${key}.`);
      result[key] = value;
    }
  }
  return Object.freeze({ ...result, toggles: Object.freeze(toggles), fonts: Object.freeze(fonts) });
}

const PARAGRAPH_VALUE_KEYS = [
  'align', 'spacingBefore', 'spacingAfter', 'line', 'lineRule', 'indentLeft', 'indentRight',
  'firstLine', 'hanging', 'keepNext', 'keepLines', 'pageBreakBefore', 'background',
] as const;

function copyParagraphFormatting(input: WordParagraphFormatting = {}): WordParagraphFormatting {
  const result: { -readonly [K in keyof WordParagraphFormatting]: WordParagraphFormatting[K] } = {};
  for (const key of PARAGRAPH_VALUE_KEYS) {
    const value = own(input, key);
    if (value === undefined) continue;
    if (['spacingBefore', 'spacingAfter', 'line'].includes(key)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 20_000_000) throw new Error(`Invalid Word paragraph ${key}.`);
    } else if (['indentLeft', 'indentRight'].includes(key)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > 20_000_000) throw new Error(`Invalid Word paragraph ${key}.`);
    } else if (key === 'firstLine' || key === 'hanging') {
      if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 20_000_000)) throw new Error(`Invalid Word paragraph ${key}.`);
    } else if (['keepNext', 'keepLines', 'pageBreakBefore'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error(`Invalid Word paragraph ${key}.`);
    } else if (key === 'lineRule') {
      if (!['auto', 'exact', 'atLeast'].includes(String(value))) throw new Error('Invalid Word paragraph lineRule.');
    } else if (key === 'align') {
      if (typeof value !== 'string' || !value || value.length > 64) throw new Error('Invalid Word paragraph alignment.');
    } else if (key === 'background') {
      if (value !== null && (typeof value !== 'string' || !value || value.length > 64)) throw new Error('Invalid Word paragraph background.');
    }
    Object.assign(result, { [key]: value });
  }
  const borders: Partial<Record<WordParagraphBorderSide, WordParagraphBorder | null>> = {};
  for (const side of WORD_PARAGRAPH_BORDER_SIDES) {
    const border = input.borders?.[side];
    if (border === undefined) continue;
    if (border === null) { borders[side] = null; continue; }
    if (!border.value || border.value.length > 64
      || (border.size !== undefined && (!Number.isSafeInteger(border.size) || border.size < 0 || border.size > 768))
      || (border.space !== undefined && (!Number.isSafeInteger(border.space) || border.space < 0 || border.space > 1_000))
      || (border.color !== undefined && (!border.color || border.color.length > 64))) throw new Error(`Invalid Word paragraph ${side} border.`);
    borders[side] = Object.freeze({ ...border });
  }
  if (Object.keys(borders).length) result.borders = Object.freeze(borders);
  return Object.freeze(result);
}

/** Compile an owned style index once, then resolve runs with bounded chain walks.
 * No linked-style, UI name, "next style" or default-character-style inference.
 * The caller resolves table regions separately; supported table text precedes
 * paragraph/character declarations here. Numbering and native Word layout remain
 * incomplete; this is not a complete Word layout resolver.
 */
export function createWordRunStyleCascade(input: {
  readonly styles: readonly WordStyleDefinition[];
  readonly defaults?: WordRunFormatting;
  readonly paragraphDefaults?: WordParagraphFormatting;
  readonly maxStyles?: number;
  readonly maxDepth?: number;
}) {
  const maxStyles = input.maxStyles ?? 4096; const maxDepth = input.maxDepth ?? 64;
  if (!Number.isSafeInteger(maxStyles) || maxStyles < 1 || maxStyles > 100_000
    || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 256) throw new Error('Invalid Word style limits.');
  if (input.styles.length > maxStyles) throw new Error(`Word styles exceed ${maxStyles} definitions.`);
  const defaults = copyFormatting(input.defaults);
  const paragraphDefaults = copyParagraphFormatting(input.paragraphDefaults);
  const styles = new Map<string, WordStyleDefinition>();
  let defaultParagraph: string | undefined;
  for (const definition of input.styles) {
    if (!definition.id || definition.id.length > 253 || (definition.kind !== 'paragraph' && definition.kind !== 'character')) {
      throw new Error('Invalid Word style identity/type.');
    }
    if (definition.basedOn !== undefined && (!definition.basedOn || definition.basedOn.length > 253)) throw new Error('Invalid Word parent style identity.');
    if (styles.has(definition.id)) throw new Error(`Duplicate Word style ${definition.id}.`);
    if (definition.isDefault && definition.kind === 'paragraph') {
      if (defaultParagraph !== undefined) throw new Error('Ambiguous default Word paragraph style.');
      defaultParagraph = definition.id;
    }
    styles.set(definition.id, Object.freeze({ id: definition.id, kind: definition.kind, basedOn: definition.basedOn,
      isDefault: definition.isDefault, run: copyFormatting(definition.run), paragraph: copyParagraphFormatting(definition.paragraph) }));
  }
  type Chain = { readonly styles: readonly WordStyleDefinition[]; readonly issues: readonly WordStyleIssue[] };
  // Cache known IDs only: arbitrary missing IDs must not grow a document's cache.
  const cache = new Map<string, Chain>();
  function chain(id: string | undefined, kind: WordStyleDefinition['kind']): Chain {
    if (id === undefined) return { styles: [], issues: [] };
    const key = `${kind}:${id}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const collected: WordStyleDefinition[] = []; const issues: WordStyleIssue[] = []; const seen = new Set<string>();
    let next: string | undefined = id;
    while (next !== undefined) {
      if (seen.has(next)) {
        issues.push({ code: 'style-cycle', styleId: next });
        // No arbitrary ordering for a cycle; retain defaults and direct formatting.
        collected.length = 0; break;
      }
      if (collected.length >= maxDepth) {
        issues.push({ code: 'style-depth-limit', styleId: next }); collected.length = 0; break;
      }
      const style = styles.get(next);
      if (!style) { issues.push({ code: 'missing-style', styleId: next }); break; }
      if (style.kind !== kind) { issues.push({ code: 'wrong-style-kind', styleId: next }); break; }
      seen.add(next); collected.push(style); next = style.basedOn;
    }
    const result = Object.freeze({ styles: Object.freeze(collected.reverse()), issues: Object.freeze(issues.map(issue => Object.freeze(issue))) });
    if (styles.has(id)) cache.set(key, result);
    return result;
  }

  return Object.freeze({
    resolve(input: { readonly paragraphStyle?: string; readonly characterStyle?: string; readonly direct?: WordRunFormatting; readonly table?: WordTableTextFormatting } = {}): ResolvedWordRun {
      const paragraph = chain(input.paragraphStyle ?? defaultParagraph, 'paragraph');
      const character = chain(input.characterStyle, 'character');
      const direct = copyFormatting(input.direct);
      const output: MutableFormatting = { toggles: {}, fonts: {} };
      const issues = [...paragraph.issues, ...character.issues];
      const styleLayers = [...paragraph.styles, ...character.styles];
      function values(layer: WordRunFormatting) {
        for (const key of VALUE_KEYS) {
          const value = layer[key];
          if (value !== undefined) Object.assign(output, { [key]: value });
        }
        // Each font slot chooses its nearest declaration, not the nearest rFonts
        // object. A nearer named face replaces a theme; a nearer theme replaces a
        // name. Do not retain a stale inherited theme that masks a direct font.
        for (const slot of WORD_FONT_SLOTS) if (layer.fonts?.[slot]) output.fonts[slot] = layer.fonts[slot];
      }
      values(defaults);
      const tableLayers = input.table?.runs.map(copyFormatting) ?? [];
      for (const layer of tableLayers) values(layer);
      for (const style of styleLayers) values(style.run!);
      values(direct);
      for (const property of WORD_TOGGLES) {
        const initial = defaults.toggles?.[property];
        let value = initial ?? false;
        let specified = initial !== undefined;
        let tableSpecified = false;
        for (const layer of tableLayers) {
          const declaration = layer.toggles?.[property];
          if (declaration === undefined) continue;
          specified = true; tableSpecified = true; value = declaration;
        }
        let styleSpecified = false;
        for (const style of styleLayers) {
          const declaration = style.run!.toggles?.[property];
          if (declaration === undefined) continue;
          specified = true; styleSpecified = true;
          // ECMA style declarations toggle on true; false leaves the inherited
          // value alone. Direct run declarations below are absolute instead.
          if (declaration) value = !value;
        }
        const override = direct.toggles?.[property];
        if (override !== undefined) output.toggles[property] = override;
        else if (initial === true && styleSpecified && !tableSpecified) {
          // MS-OI29500 2.1.230 documents Word-specific default=true behaviour.
          // Do not claim a guessed XOR result matches Word. Native fixtures are
          // required before projecting this unresolved combination into marks.
          output.toggles[property] = 'unresolved';
          issues.push({ code: 'word-default-toggle-unverified', property });
        } else if (specified) output.toggles[property] = value;
      }
      return Object.freeze({
        formatting: Object.freeze({ ...output, fonts: Object.freeze(output.fonts), toggles: Object.freeze(output.toggles) }),
        paragraphChain: Object.freeze(paragraph.styles.map(style => style.id)),
        characterChain: Object.freeze(character.styles.map(style => style.id)),
        issues: Object.freeze(issues.map(issue => Object.freeze(issue))),
      });
    },
    resolveParagraph(input: { readonly paragraphStyle?: string; readonly direct?: WordParagraphFormatting; readonly table?: WordTableTextFormatting } = {}): ResolvedWordParagraph {
      const paragraph = chain(input.paragraphStyle ?? defaultParagraph, 'paragraph');
      const layers = [paragraphDefaults, ...input.table?.paragraphs.map(copyParagraphFormatting) ?? [], ...paragraph.styles.map(style => style.paragraph!), copyParagraphFormatting(input.direct)];
      const output: { -readonly [K in keyof WordParagraphFormatting]: WordParagraphFormatting[K] } = {};
      const borders: Partial<Record<WordParagraphBorderSide, WordParagraphBorder | null>> = {};
      for (const layer of layers) {
        for (const key of PARAGRAPH_VALUE_KEYS) {
          const value = own(layer, key);
          if (value !== undefined) Object.assign(output, { [key]: value });
        }
        for (const side of WORD_PARAGRAPH_BORDER_SIDES) {
          const value = layer.borders?.[side];
          if (value !== undefined) borders[side] = value;
        }
      }
      if (Object.keys(borders).length) output.borders = Object.freeze(borders);
      return Object.freeze({
        formatting: Object.freeze(output),
        paragraphChain: Object.freeze(paragraph.styles.map(style => style.id)),
        issues: paragraph.issues,
      });
    },
  });
}
