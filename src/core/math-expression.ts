/** Platform-neutral semantic math retained independently of TeX, MathML, or OMML. */
export type MathExpression =
  | { readonly type: 'text'; readonly value: string; readonly style?: 'plain' | 'italic' | 'bold' | 'bold-italic' }
  | { readonly type: 'row'; readonly content: readonly MathExpression[] }
  | { readonly type: 'fraction'; readonly numerator: MathExpression; readonly denominator: MathExpression; readonly bar?: boolean }
  | { readonly type: 'radical'; readonly body: MathExpression; readonly degree?: MathExpression }
  | { readonly type: 'script'; readonly base: MathExpression; readonly sub?: MathExpression; readonly sup?: MathExpression }
  | { readonly type: 'delimiter'; readonly body: MathExpression; readonly open: string; readonly close: string }
  | { readonly type: 'nary'; readonly symbol: string; readonly body: MathExpression; readonly sub?: MathExpression; readonly sup?: MathExpression; readonly limits?: 'beside' | 'above-below' }
  | { readonly type: 'matrix'; readonly rows: readonly (readonly MathExpression[])[] }
  | { readonly type: 'accent'; readonly body: MathExpression; readonly character: string }
  | { readonly type: 'function'; readonly name: MathExpression; readonly argument: MathExpression }
  | { readonly type: 'limit'; readonly base: MathExpression; readonly limit: MathExpression; readonly position: 'lower' | 'upper' }
  | { readonly type: 'equation_array'; readonly rows: readonly MathExpression[] };

const properties: Readonly<Record<MathExpression['type'], readonly string[]>> = {
  text: ['value', 'style'], row: ['content'], fraction: ['numerator', 'denominator', 'bar'],
  radical: ['body', 'degree'], script: ['base', 'sub', 'sup'], delimiter: ['body', 'open', 'close'],
  nary: ['symbol', 'body', 'sub', 'sup', 'limits'], matrix: ['rows'], accent: ['body', 'character'],
  function: ['name', 'argument'], limit: ['base', 'limit', 'position'], equation_array: ['rows'],
};

/** Validates the bounded, JSON-safe semantic math representation used by core adapters. */
export function isMathExpression(value: unknown): value is MathExpression {
  let nodes = 0;
  let characters = 0;
  const active = new Set<object>();
  const text = (input: unknown, single = false): input is string => {
    if (typeof input !== 'string' || input.includes('\0') || (single && Array.from(input).length !== 1)) return false;
    characters += input.length;
    return characters <= 100_000;
  };
  const visit = (input: unknown, depth = 0): boolean => {
    if (++nodes > 10_000 || depth > 64 || !input || typeof input !== 'object' || Array.isArray(input) || active.has(input)) return false;
    const record = input as Record<string, unknown>;
    if (typeof record.type !== 'string' || !Object.hasOwn(properties, record.type)) return false;
    const allowed = properties[record.type as MathExpression['type']]!;
    if (Object.keys(record).some(key => key !== 'type' && !allowed.includes(key))) return false;
    active.add(input);
    const child = (item: unknown) => visit(item, depth + 1);
    let valid = false;
    switch (record.type) {
      case 'text': valid = text(record.value) && (record.style === undefined || ['plain', 'italic', 'bold', 'bold-italic'].includes(String(record.style))); break;
      case 'row': valid = Array.isArray(record.content) && record.content.length <= 10_000 && record.content.every(child); break;
      case 'fraction': valid = child(record.numerator) && child(record.denominator) && (record.bar === undefined || typeof record.bar === 'boolean'); break;
      case 'radical': valid = child(record.body) && (record.degree === undefined || child(record.degree)); break;
      case 'script': valid = child(record.base) && (record.sub !== undefined || record.sup !== undefined) && (record.sub === undefined || child(record.sub)) && (record.sup === undefined || child(record.sup)); break;
      case 'delimiter': valid = text(record.open, true) && text(record.close, true) && child(record.body); break;
      case 'nary': valid = text(record.symbol, true) && child(record.body) && (record.sub === undefined || child(record.sub)) && (record.sup === undefined || child(record.sup)) && (record.limits === undefined || ['beside', 'above-below'].includes(String(record.limits))); break;
      case 'matrix': {
        const rows = record.rows;
        const width = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0].length : 0;
        valid = Array.isArray(rows) && rows.length > 0 && rows.length <= 100 && width > 0 && width <= 100
          && rows.every(row => Array.isArray(row) && row.length === width && row.every(child));
        break;
      }
      case 'accent': valid = text(record.character, true) && /^\p{M}$/u.test(record.character as string) && child(record.body); break;
      case 'function': valid = child(record.name) && child(record.argument); break;
      case 'limit': valid = ['lower', 'upper'].includes(String(record.position)) && child(record.base) && child(record.limit); break;
      case 'equation_array': valid = Array.isArray(record.rows) && record.rows.length > 0 && record.rows.length <= 100 && record.rows.every(child); break;
    }
    active.delete(input);
    return valid;
  };
  return visit(value);
}

/** Reads a bounded semantic expression from an interchange attribute. */
export function parseMathExpressionJSON(value: string | null | undefined): MathExpression | undefined {
  if (!value || value.length > 1_000_000) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isMathExpression(parsed) ? parsed : undefined;
  } catch { return undefined; }
}
