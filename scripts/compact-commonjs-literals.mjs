import MagicString from 'magic-string';
import { parseAst } from 'vite';

const expressionParents = new Set([
  'ArrayExpression', 'AssignmentExpression', 'BinaryExpression', 'ConditionalExpression',
  'LogicalExpression', 'Property', 'ReturnStatement', 'VariableDeclarator',
]);

function literalValue(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
}

function canShare(node, parent, code) {
  if (!parent || parent.key === node || parent.id === node) return false;
  if (expressionParents.has(parent.type)) return true;
  if (!['CallExpression', 'NewExpression'].includes(parent.type) || !parent.arguments.includes(node)) return false;
  const callee = code.slice(parent.callee.start, parent.callee.end);
  // Keep dependency and export names visible to static analysis.
  return parent.type === 'NewExpression' ? /Error$/u.test(callee)
    : !/require|resolve|defineProperty|eval/iu.test(callee);
}

/** Let the chunk minifier assign short names to repeated string values. */
export function compactCommonJsLiterals(code) {
  const tree = parseAst(code);
  const literals = new Map();
  function visit(node, parent) {
    const value = literalValue(node);
    if (value?.length >= 8 && canShare(node, parent, code)) {
      const uses = literals.get(value) ?? [];
      uses.push(node);
      literals.set(value, uses);
    }
    for (const child of Object.values(node)) {
      if (child?.type) visit(child, node);
      else if (Array.isArray(child)) for (const item of child) if (item?.type) visit(item, node);
    }
  }
  visit(tree);

  const edited = new MagicString(code);
  const bindings = [];
  let prefix = '__fountainLiteral$';
  while (code.includes(prefix)) prefix += '$';
  for (const [value, uses] of literals) {
    if (uses.length < 2) continue;
    const encoded = JSON.stringify(value);
    const savings = uses.reduce((sum, use) => sum + use.end - use.start - 3, 0) - encoded.length;
    if (savings < 10) continue;
    const name = prefix + bindings.length;
    bindings.push(`${name}=${encoded}`);
    for (const use of uses) edited.overwrite(use.start, use.end, ` ${name} `);
  }
  if (!bindings.length) return;
  // Preserve any leading directives, including strict mode.
  const first = tree.body.find(statement => statement.type !== 'ExpressionStatement'
    || statement.expression.type !== 'Literal' || typeof statement.expression.value !== 'string');
  edited.appendLeft(first.start, `const ${bindings.join(',')};\n`);
  return { code: edited.toString(), map: edited.generateMap({ hires: true }) };
}
