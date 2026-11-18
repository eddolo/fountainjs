import MagicString from 'magic-string';
import { parseAst } from 'vite';

const expressionParents = new Set([
  'ArrayExpression', 'AssignmentExpression', 'BinaryExpression', 'ConditionalExpression',
  'LogicalExpression', 'Property', 'ReturnStatement', 'VariableDeclarator',
]);

const staticKeys = new Set(['__proto__', '__esModule', 'configurable', 'enumerable', 'writable']);

function literalValue(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
}

function canShare(node, parent, code) {
  if (!parent || parent.key === node || parent.id === node) return false;
  if (expressionParents.has(parent.type)) return true;
  if (parent.type === 'SwitchCase') return parent.test === node;
  if (parent.type === 'ArrowFunctionExpression') return parent.body === node;
  if (!['CallExpression', 'NewExpression'].includes(parent.type) || !parent.arguments.includes(node)) return false;
  const callee = code.slice(parent.callee.start, parent.callee.end);
  // Keep dependency and export names visible to static analysis.
  return parent.type === 'NewExpression' ? /Error$/u.test(callee)
    : !/require|resolve|defineProperty|eval/iu.test(callee);
}

function isModuleRead(node, moduleBindings) {
  if (node.type === 'Identifier') return moduleBindings.has(node.name);
  if (node.type === 'MemberExpression') return isModuleRead(node.object, moduleBindings);
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  return callee.type === 'Identifier' ? callee.name === 'require'
    : callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'module';
}

function shareableUse(node, parent, moduleBindings, code) {
  const value = literalValue(node);
  if (value?.length >= 6 && canShare(node, parent, code)) {
    return { value, start: node.start, end: node.end, member: false };
  }
  if (node.type === 'MemberExpression' && !node.computed
    && node.object.type !== 'Super' && node.property.type === 'Identifier'
    && !isModuleRead(node.object, moduleBindings)
    && !staticKeys.has(node.property.name)
    && node.property.name.length >= 5 && code[node.property.start - 1] === '.') {
    // Optional access retains its `?.` token before the computed property.
    const start = node.optional ? node.property.start : node.property.start - 1;
    return { value: node.property.name, start, end: node.property.end, member: true };
  }
  const publicField = node.type === 'PropertyDefinition';
  if ((publicField || (node.type === 'Property' && parent?.type === 'ObjectExpression'))
    && !node.computed && !node.shorthand && node.key.type === 'Identifier'
    && node.key.name.length >= 6 && !staticKeys.has(node.key.name)) {
    return { value: node.key.name, start: node.key.start, end: node.key.end, member: true };
  }
}

// Match only the bundler's simple, top-level live-binding exports.
const forwardingGetter = /^Object\.defineProperty\(exports,\s*('[\w$]+'|"[\w$]+"),\s*\{\s*enumerable:\s*true,\s*(get(?:\s*:\s*function)?\s*\(\)\s*\{\s*return\s+[\w$]+;?\s*\}),?\s*\}\);?$/u;

/** Share repeated string values and member names within each CommonJS chunk. */
export function compactCommonJsLiterals(code, privateChunk = false) {
  const tree = parseAst(code);
  const moduleBindings = new Set(['exports', 'module', 'require', 'Object', 'Reflect']);
  for (const statement of tree.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const { id, init } of statement.declarations) {
      // Keep direct reads from loaded modules statically visible to bundlers.
      if (id.type === 'Identifier' && init && /\brequire\s*\(/u.test(code.slice(init.start, init.end))) {
        moduleBindings.add(id.name);
      }
    }
  }
  const literals = new Map();
  function visit(node, parent) {
    const use = shareableUse(node, parent, moduleBindings, code);
    if (use) {
      const uses = literals.get(use.value) ?? [];
      uses.push(use);
      literals.set(use.value, uses);
    }
    for (const child of Object.values(node)) {
      if (child?.type) visit(child, node);
      else if (Array.isArray(child)) for (const item of child) if (item?.type) visit(item, node);
    }
  }
  const edited = new MagicString(code);
  const getters = new Map();
  if (privateChunk) for (const statement of tree.body) {
    if (statement.type !== 'ExpressionStatement') continue;
    const match = forwardingGetter.exec(code.slice(statement.start, statement.end));
    if (match) getters.set(statement, match);
  }
  if (getters.size >= 3) {
    let helper = '__fountainLiveExport';
    while (code.includes(helper)) helper += '$';
    for (const statement of tree.body) {
      const match = getters.get(statement);
      if (match) edited.overwrite(statement.start, statement.end, `${helper}(${match[1]}, {${match[2]}});`);
      else visit(statement, tree);
    }
    // Register getters in their original order, including in circular imports.
    edited.append(`\nfunction ${helper}(key, descriptor) { descriptor.enumerable = true; Object.defineProperty(exports, key, descriptor); }\n`);
  } else visit(tree);
  const bindings = [];
  let prefix = '__fountainLiteral$';
  while (code.includes(prefix)) prefix += '$';
  for (const [value, uses] of literals) {
    if (uses.length < 2) continue;
    const encoded = JSON.stringify(value);
    const savings = uses.reduce((sum, use) => sum + use.end - use.start - (use.member ? 5 : 3), 0) - encoded.length;
    if (savings < 10) continue;
    const name = prefix + bindings.length;
    bindings.push(`${name}=${encoded}`);
    for (const use of uses) edited.overwrite(use.start, use.end, use.member ? `[${name}]` : ` ${name} `);
  }
  if (!bindings.length && getters.size < 3) return;
  // Preserve any leading directives, including strict mode.
  const first = tree.body.find(statement => statement.type !== 'ExpressionStatement'
    || statement.expression.type !== 'Literal' || typeof statement.expression.value !== 'string');
  if (bindings.length) edited.appendLeft(first.start, `const ${bindings.join(',')};\n`);
  return { code: edited.toString(), map: edited.generateMap({ hires: true }) };
}
