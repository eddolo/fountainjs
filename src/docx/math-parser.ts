import type { XMLElement } from './xml-types';
import type { DOCXMathExpression } from './math';

const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const STYLE = { p: 'plain', i: 'italic', b: 'bold', bi: 'bold-italic' } as const;
const ACCENTS = new Set(['\u0300', '\u0301', '\u0302', '\u0303', '\u0306', '\u0307', '\u0308', '\u030c', '\u20d7']);
const unsupported = (): never => { throw new Error('Unsupported Word math structure.'); };

function name(element: XMLElement): string | undefined {
  const split = element.name.indexOf(':');
  const prefix = split < 0 ? '' : element.name.slice(0, split);
  return element.namespaces[prefix] === MATH_NS ? element.name.slice(split + 1) : undefined;
}

function elements(element: XMLElement): XMLElement[] {
  return element.children.filter((child): child is XMLElement => typeof child !== 'string');
}

function mathChildren(element: XMLElement): XMLElement[] {
  const result: XMLElement[] = [];
  for (const child of elements(element)) {
    if (name(child)) result.push(child);
    else throw new Error(`Unsupported foreign element ${child.name} inside Word math.`);
  }
  return result;
}

function attr(element: XMLElement | undefined, local: string): string | undefined {
  if (!element) return undefined;
  for (const [key, value] of Object.entries(element.attrs)) {
    if (key === local || key.endsWith(`:${local}`)) return value;
  }
  return undefined;
}

function direct(element: XMLElement, local: string): XMLElement[] {
  return mathChildren(element).filter(child => name(child) === local);
}

function property(element: XMLElement, propertyName: string, valueName: string): string | undefined {
  const container = direct(element, propertyName)[0];
  return attr(direct(container ?? element, valueName)[0], 'val');
}

function falseValue(value: string | undefined): boolean {
  return value === '0' || value === 'false' || value === 'off';
}

function trueValue(value: string | undefined): boolean {
  return value !== undefined && !falseValue(value);
}

/** Parses Fountain's deliberately bounded semantic OMML subset without a DOM. */
export function parseDOCXMath(root: XMLElement): DOCXMathExpression {
  let visited = 0;
  let characters = 0;

  const row = (content: DOCXMathExpression[]): DOCXMathExpression => content.length === 1
    ? content[0]!
    : { type: 'row', content };

  const sequence = (element: XMLElement, depth: number, ignored: readonly string[] = []): DOCXMathExpression => {
    const content = mathChildren(element)
      .filter(child => !ignored.includes(name(child)!))
      .map(child => visit(child, depth + 1));
    if (!content.length) throw new Error(`Empty Word math ${name(element) ?? element.name} container.`);
    return row(content);
  };

  const argument = (element: XMLElement, argumentName: string, depth: number, optional = false): DOCXMathExpression | undefined => {
    const matches = direct(element, argumentName);
    if (matches.length > 1) throw new Error(`Duplicate Word math ${argumentName} argument.`);
    if (!matches.length) {
      if (optional) return undefined;
      throw new Error(`Missing Word math ${argumentName} argument.`);
    }
    return sequence(matches[0]!, depth + 1);
  };

  const requireOnly = (element: XMLElement, allowed: readonly string[]): void => {
    if (mathChildren(element).some(child => !allowed.includes(name(child)!))) unsupported();
  };

  const visit = (element: XMLElement, depth = 0): DOCXMathExpression => {
    if (++visited > 10_000 || depth > 64) throw new Error('Word math exceeds its node or depth limit.');
    const kind = name(element);
    if (!kind) throw new Error(`Element ${element.name} is not Word math.`);
    switch (kind) {
      case 'oMathPara': {
        const equations = direct(element, 'oMath');
        if (equations.length !== 1 || mathChildren(element).some(child => !['oMath', 'oMathParaPr'].includes(name(child)!))) {
          throw new Error('Word display math must contain exactly one supported equation.');
        }
        return visit(equations[0]!, depth + 1);
      }
      case 'oMath': return sequence(element, depth, ['oMathPr']);
      case 'r': {
        const children = mathChildren(element);
        if (children.some(child => !['rPr', 't'].includes(name(child)!))) throw new Error('Unsupported Word math run content.');
        const value = children.filter(child => name(child) === 't')
          .map(child => child.children.filter(item => typeof item === 'string').join('')).join('');
        characters += value.length;
        if (characters > 100_000) throw new Error('Word math exceeds 100,000 text characters.');
        const styleValue = property(element, 'rPr', 'sty');
        if (styleValue !== undefined && !Object.hasOwn(STYLE, styleValue)) throw new Error(`Unsupported Word math text style ${styleValue}.`);
        return { type: 'text', value, ...(styleValue ? { style: STYLE[styleValue as keyof typeof STYLE] } : {}) };
      }
      case 'f': {
        const fractionType = property(element, 'fPr', 'type');
        if (fractionType !== undefined && !['bar', 'lin', 'skw', 'noBar'].includes(fractionType)) throw new Error(`Unsupported Word fraction type ${fractionType}.`);
        if (fractionType === 'lin' || fractionType === 'skw') throw new Error(`Word ${fractionType} fractions do not have a faithful Fountain projection.`);
        return { type: 'fraction', numerator: argument(element, 'num', depth)!, denominator: argument(element, 'den', depth)!, ...(fractionType === 'noBar' ? { bar: false } : {}) };
      }
      case 'rad': {
        const hidden = trueValue(property(element, 'radPr', 'degHide'));
        return { type: 'radical', body: argument(element, 'e', depth)!, ...(!hidden ? { degree: argument(element, 'deg', depth, true) } : {}) };
      }
      case 'sSub': return { type: 'script', base: argument(element, 'e', depth)!, sub: argument(element, 'sub', depth)! };
      case 'sSup': return { type: 'script', base: argument(element, 'e', depth)!, sup: argument(element, 'sup', depth)! };
      case 'sSubSup': return { type: 'script', base: argument(element, 'e', depth)!, sub: argument(element, 'sub', depth)!, sup: argument(element, 'sup', depth)! };
      case 'd': {
        const open = property(element, 'dPr', 'begChr') ?? '(';
        const close = property(element, 'dPr', 'endChr') ?? ')';
        if (Array.from(open).length > 1 || Array.from(close).length > 1) throw new Error('Word math delimiters must be single characters.');
        return { type: 'delimiter', open, close, body: argument(element, 'e', depth)! };
      }
      case 'nary': {
        const symbol = property(element, 'naryPr', 'chr') ?? '∫';
        if (Array.from(symbol).length !== 1) throw new Error('Word large-operator symbols must be one character.');
        const location = property(element, 'naryPr', 'limLoc');
        if (location !== undefined && !['subSup', 'undOvr'].includes(location)) throw new Error(`Unsupported Word limit location ${location}.`);
        const sub = trueValue(property(element, 'naryPr', 'subHide')) ? undefined : argument(element, 'sub', depth, true);
        const sup = trueValue(property(element, 'naryPr', 'supHide')) ? undefined : argument(element, 'sup', depth, true);
        return { type: 'nary', symbol, body: argument(element, 'e', depth)!, ...(sub ? { sub } : {}), ...(sup ? { sup } : {}), limits: location === 'undOvr' ? 'above-below' : 'beside' };
      }
      case 'm': {
        const rows = direct(element, 'mr');
        if (!rows.length || rows.length > 100) throw new Error('Word matrix must contain 1 to 100 rows.');
        const parsed = rows.map(matrixRow => {
          const cells = direct(matrixRow, 'e');
          if (!cells.length || cells.length > 100) throw new Error('Word matrix rows must contain 1 to 100 cells.');
          return cells.map(cell => sequence(cell, depth + 2));
        });
        if (parsed.some(item => item.length !== parsed[0]!.length)) throw new Error('Word matrix must be rectangular.');
        return { type: 'matrix', rows: parsed };
      }
      case 'acc': {
        const character = property(element, 'accPr', 'chr') ?? '\u0302';
        if (!ACCENTS.has(character)) throw new Error(`Unsupported Word math accent ${character}.`);
        return { type: 'accent', character, body: argument(element, 'e', depth)! };
      }
      case 'func':
        requireOnly(element, ['funcPr', 'fName', 'e']);
        return { type: 'function', name: argument(element, 'fName', depth)!, argument: argument(element, 'e', depth)! };
      case 'limLow':
      case 'limUpp': {
        requireOnly(element, [`${kind}Pr`, 'e', 'lim']);
        return { type: 'limit', base: argument(element, 'e', depth)!, limit: argument(element, 'lim', depth)!, position: kind === 'limLow' ? 'lower' : 'upper' };
      }
      case 'eqArr': {
        const rows = direct(element, 'e');
        if (!rows.length || rows.length > 100) unsupported();
        if (mathChildren(element).some(child => !['eqArrPr', 'e'].includes(name(child)!))) unsupported();
        return { type: 'equation_array', rows: rows.map(item => sequence(item, depth + 1)) };
      }
      default: throw new Error(`Unsupported Word math structure ${kind}.`);
    }
  };

  return visit(root);
}

const LARGE_OPERATORS: Readonly<Record<string, string>> = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap',
};
const TEX_ACCENTS: Readonly<Record<string, string>> = {
  '\u0300': 'grave', '\u0301': 'acute', '\u0302': 'hat', '\u0303': 'tilde', '\u0306': 'breve', '\u0307': 'dot', '\u0308': 'ddot', '\u030c': 'check', '\u20d7': 'vec',
};

function texText(value: string): string {
  return value.replace(/[\\{}#$%&_]/gu, character => ({ '\\': '\\backslash{}', '{': '\\{', '}': '\\}', '#': '\\#', '$': '\\$', '%': '\\%', '&': '\\&', '_': '\\_' })[character]!);
}

/** Creates editable TeX for the supported semantic tree; it never executes source. */
export function docxMathToTeX(expression: DOCXMathExpression): string {
  const visit = (value: DOCXMathExpression): string => {
    switch (value.type) {
      case 'text': {
        const content = texText(value.value);
        return value.style === 'plain' ? `\\mathrm{${content}}`
          : value.style === 'italic' ? `\\mathit{${content}}`
          : value.style === 'bold' ? `\\mathbf{${content}}`
          : value.style === 'bold-italic' ? `\\boldsymbol{${content}}` : content;
      }
      case 'row': return value.content.map(visit).join('');
      case 'fraction': return value.bar === false
        ? `\\genfrac{}{}{0pt}{}{${visit(value.numerator)}}{${visit(value.denominator)}}`
        : `\\frac{${visit(value.numerator)}}{${visit(value.denominator)}}`;
      case 'radical': return `\\sqrt${value.degree ? `[${visit(value.degree)}]` : ''}{${visit(value.body)}}`;
      case 'script': return `{${visit(value.base)}}${value.sub ? `_{${visit(value.sub)}}` : ''}${value.sup ? `^{${visit(value.sup)}}` : ''}`;
      case 'delimiter': return `\\left${texText(value.open)}${visit(value.body)}\\right${texText(value.close)}`;
      case 'nary': return `${LARGE_OPERATORS[value.symbol] ?? texText(value.symbol)}${value.limits === 'above-below' ? '\\limits' : '\\nolimits'}${value.sub ? `_{${visit(value.sub)}}` : ''}${value.sup ? `^{${visit(value.sup)}}` : ''}{${visit(value.body)}}`;
      case 'matrix': return `\\begin{matrix}${value.rows.map(row => row.map(visit).join(' & ')).join(' \\\\ ')}\\end{matrix}`;
      case 'accent': return `\\${TEX_ACCENTS[value.character]}{${visit(value.body)}}`;
      case 'function': {
        const functionName = value.name.type === 'text' && value.name.style === undefined
          ? `\\operatorname{${texText(value.name.value)}}`
          : `\\mathop{${visit(value.name)}}`;
        return `${functionName}${visit(value.argument)}`;
      }
      case 'limit': return value.position === 'lower'
        ? `\\underset{${visit(value.limit)}}{${visit(value.base)}}`
        : `\\overset{${visit(value.limit)}}{${visit(value.base)}}`;
      case 'equation_array': return `\\begin{aligned}${value.rows.map(visit).join(' \\\\ ')}\\end{aligned}`;
    }
  };
  return visit(expression);
}
