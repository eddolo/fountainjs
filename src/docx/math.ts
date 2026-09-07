/** Host-supplied semantic math, independent of TeX parsers and browser DOM. */
export type DOCXMathExpression =
  | { readonly type: 'text'; readonly value: string; readonly style?: 'plain' | 'italic' | 'bold' | 'bold-italic' }
  | { readonly type: 'row'; readonly content: readonly DOCXMathExpression[] }
  | { readonly type: 'fraction'; readonly numerator: DOCXMathExpression; readonly denominator: DOCXMathExpression; readonly bar?: boolean }
  | { readonly type: 'radical'; readonly body: DOCXMathExpression; readonly degree?: DOCXMathExpression }
  | { readonly type: 'script'; readonly base: DOCXMathExpression; readonly sub?: DOCXMathExpression; readonly sup?: DOCXMathExpression }
  | { readonly type: 'delimiter'; readonly body: DOCXMathExpression; readonly open: string; readonly close: string }
  | { readonly type: 'nary'; readonly symbol: string; readonly body: DOCXMathExpression; readonly sub?: DOCXMathExpression; readonly sup?: DOCXMathExpression; readonly limits?: 'beside' | 'above-below' }
  | { readonly type: 'matrix'; readonly rows: readonly (readonly DOCXMathExpression[])[] }
  | { readonly type: 'accent'; readonly body: DOCXMathExpression; readonly character: string };

const namespace = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const allowed: Record<string, readonly string[]> = {
  text: ['value', 'style'], row: ['content'], fraction: ['numerator', 'denominator', 'bar'],
  radical: ['body', 'degree'], script: ['base', 'sub', 'sup'], delimiter: ['body', 'open', 'close'],
  nary: ['symbol', 'body', 'sub', 'sup', 'limits'], matrix: ['rows'], accent: ['body', 'character'],
};
const escape = (value: string) => value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

/** Internal serializer. Fails closed on unknown semantics rather than dropping them. */
export function serializeDOCXMath(expression: DOCXMathExpression, display: boolean): string {
  let nodes = 0;
  let characters = 0;
  const text = (value: unknown, single = false): string => {
    if (typeof value !== 'string' || /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(value)) {
      throw new TypeError('Math text must contain valid XML characters.');
    }
    if (single && Array.from(value).length > 1) throw new TypeError('Math symbols and delimiters must be single characters.');
    characters += value.length;
    if (characters > 100_000) throw new RangeError('Math expression exceeds 100,000 text characters.');
    return escape(value);
  };
  const visit = (input: DOCXMathExpression, depth = 0): string => {
    if (++nodes > 10_000 || depth > 64) throw new RangeError('Math expression exceeds its node or depth limit.');
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.hasOwn(allowed, input.type)) {
      throw new TypeError('Unsupported math expression.');
    }
    const keys = allowed[input.type]!;
    if (Object.keys(input).some(key => key !== 'type' && !keys.includes(key))) throw new TypeError(`Unsupported ${input.type} math property.`);
    const child = (value: DOCXMathExpression) => visit(value, depth + 1);
    const argument = (name: string, value: DOCXMathExpression | undefined, optional = false) => {
      if (value === undefined && !optional) throw new TypeError(`Missing math ${name} argument.`);
      return `<m:${name}>${value === undefined ? '' : child(value)}</m:${name}>`;
    };
    const list = (items: readonly DOCXMathExpression[]) => {
      if (!Array.isArray(items) || items.length > 10_000) throw new TypeError('Math row must be a bounded array.');
      return Array.from(items).map(child).join('');
    };
    switch (input.type) {
      case 'text': {
        const styles = { plain: 'p', italic: 'i', bold: 'b', 'bold-italic': 'bi' } as const;
        const style = input.style ?? 'plain';
        if (!Object.hasOwn(styles, style)) throw new TypeError('Unsupported math text style.');
        return `<m:r><m:rPr><m:sty m:val="${styles[style]}"/></m:rPr><m:t xml:space="preserve">${text(input.value)}</m:t></m:r>`;
      }
      case 'row': return list(input.content);
      case 'fraction':
        if (input.bar !== undefined && typeof input.bar !== 'boolean') throw new TypeError('Math fraction bar must be boolean.');
        return `<m:f>${input.bar === false ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''}${argument('num', input.numerator)}${argument('den', input.denominator)}</m:f>`;
      case 'radical': return `<m:rad><m:radPr><m:degHide m:val="${input.degree !== undefined ? '0' : '1'}"/></m:radPr>${argument('deg', input.degree, true)}${argument('e', input.body)}</m:rad>`;
      case 'script': {
        if (input.sub === undefined && input.sup === undefined) throw new TypeError('Math script needs a subscript or superscript.');
        const tag = input.sub !== undefined && input.sup !== undefined ? 'sSubSup' : input.sub !== undefined ? 'sSub' : 'sSup';
        return `<m:${tag}>${argument('e', input.base)}${input.sub !== undefined ? argument('sub', input.sub) : ''}${input.sup !== undefined ? argument('sup', input.sup) : ''}</m:${tag}>`;
      }
      case 'delimiter': return `<m:d><m:dPr><m:begChr m:val="${text(input.open, true)}"/><m:endChr m:val="${text(input.close, true)}"/></m:dPr>${argument('e', input.body)}</m:d>`;
      case 'nary':
        if (input.limits !== undefined && !['beside', 'above-below'].includes(input.limits)) throw new TypeError('Unsupported math limit placement.');
        if (!input.symbol) throw new TypeError('N-ary math requires a symbol.');
        return `<m:nary><m:naryPr><m:chr m:val="${text(input.symbol, true)}"/><m:limLoc m:val="${input.limits === 'above-below' ? 'undOvr' : 'subSup'}"/><m:subHide m:val="${input.sub !== undefined ? '0' : '1'}"/><m:supHide m:val="${input.sup !== undefined ? '0' : '1'}"/></m:naryPr>${argument('sub', input.sub, true)}${argument('sup', input.sup, true)}${argument('e', input.body)}</m:nary>`;
      case 'matrix': {
        if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 100) throw new TypeError('Math matrix requires 1 to 100 rows.');
        const width = input.rows[0]?.length;
        if (!width || width > 100 || Array.from(input.rows).some(row => !Array.isArray(row) || row.length !== width)) throw new TypeError('Math matrix must be rectangular with 1 to 100 columns.');
        return `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${width}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>${input.rows.map(row => `<m:mr>${Array.from(row as readonly DOCXMathExpression[]).map(value => argument('e', value)).join('')}</m:mr>`).join('')}</m:m>`;
      }
      case 'accent':
        if (typeof input.character !== 'string' || !/^\p{M}$/u.test(input.character)) throw new TypeError('Math accent requires a combining character.');
        return `<m:acc><m:accPr><m:chr m:val="${text(input.character, true)}"/></m:accPr>${argument('e', input.body)}</m:acc>`;
    }
  };
  const body = visit(expression);
  return display
    ? `<m:oMathPara xmlns:m="${namespace}"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath>${body}</m:oMath></m:oMathPara>`
    : `<m:oMath xmlns:m="${namespace}">${body}</m:oMath>`;
}
