import type { Node } from './node';

type Expression =
  | { kind: 'name'; value: string }
  | { kind: 'sequence'; values: Expression[] }
  | { kind: 'choice'; values: Expression[] }
  | { kind: 'repeat'; value: Expression; min: number; max: number };

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly string[]) {}

  parse(): Expression {
    const expression = this.parseChoice();
    if (this.index !== this.tokens.length) throw new Error(`Unexpected content-expression token: ${this.tokens[this.index]}`);
    return expression;
  }

  private parseChoice(): Expression {
    const values = [this.parseSequence()];
    while (this.tokens[this.index] === '|') {
      this.index += 1;
      values.push(this.parseSequence());
    }
    return values.length === 1 ? values[0] as Expression : { kind: 'choice', values };
  }

  private parseSequence(): Expression {
    const values: Expression[] = [];
    while (this.index < this.tokens.length && ![')', '|'].includes(this.tokens[this.index] as string)) {
      values.push(this.parseTerm());
    }
    return values.length === 1 ? values[0] as Expression : { kind: 'sequence', values };
  }

  private parseTerm(): Expression {
    const token = this.tokens[this.index++];
    let value: Expression;
    if (token === '(') {
      value = this.parseChoice();
      if (this.tokens[this.index++] !== ')') throw new Error('Unclosed parenthesis in content expression.');
    } else if (token && /^[A-Za-z_][\w-]*$/.test(token)) {
      value = { kind: 'name', value: token };
    } else {
      throw new Error(`Invalid content-expression token: ${String(token)}`);
    }
    const quantifier = this.tokens[this.index];
    if (quantifier === '*' || quantifier === '+' || quantifier === '?') {
      this.index += 1;
      if (quantifier === '*') return { kind: 'repeat', value, min: 0, max: Number.POSITIVE_INFINITY };
      if (quantifier === '+') return { kind: 'repeat', value, min: 1, max: Number.POSITIVE_INFINITY };
      return { kind: 'repeat', value, min: 0, max: 1 };
    }
    return value;
  }
}

function tokenize(source: string): string[] {
  const tokens = source.match(/[A-Za-z_][\w-]*|[()|*+?]/g) ?? [];
  if (tokens.join('') !== source.replace(/\s+/g, '')) throw new Error(`Invalid content expression: ${source}`);
  return tokens;
}

function matchesName(node: Node, name: string): boolean {
  return node.type.name === name || node.type.spec.group?.split(/\s+/).includes(name) === true;
}

function match(expression: Expression, content: readonly Node[], start: number): Set<number> {
  if (expression.kind === 'name') {
    return start < content.length && matchesName(content[start] as Node, expression.value)
      ? new Set([start + 1])
      : new Set();
  }
  if (expression.kind === 'choice') {
    return new Set(expression.values.flatMap((value) => [...match(value, content, start)]));
  }
  if (expression.kind === 'sequence') {
    let positions = new Set([start]);
    for (const value of expression.values) {
      positions = new Set([...positions].flatMap((position) => [...match(value, content, position)]));
      if (!positions.size) break;
    }
    return positions;
  }

  let positions = new Set([start]);
  let accepted = expression.min === 0 ? new Set([start]) : new Set<number>();
  for (let count = 1; count <= content.length + 1 && count <= expression.max; count += 1) {
    const next = new Set<number>();
    positions.forEach((position) => {
      match(expression.value, content, position).forEach((result) => {
        if (result > position) next.add(result);
      });
    });
    if (!next.size) break;
    positions = next;
    if (count >= expression.min) accepted = new Set([...accepted, ...positions]);
  }
  return accepted;
}

const cache = new Map<string, Expression>();

export function matchesContentExpression(content: readonly Node[], source: string): boolean {
  let expression = cache.get(source);
  if (!expression) {
    expression = new Parser(tokenize(source)).parse();
    cache.set(source, expression);
  }
  return match(expression, content, 0).has(content.length);
}
