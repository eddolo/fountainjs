import type { Editor } from '../core/editor';
import type { Attributes, MarkJSON, Node, NodeJSON, Schema } from '../core/schema';
import { getNodeAtPath } from '../core/transaction/path';
import type { Transaction } from '../core/transaction';

export const AI_DOCUMENT_TOOL_NAMES = Object.freeze([
  'fountain.read',
  'fountain.insert',
  'fountain.replace',
  'fountain.format',
  'fountain.structure',
] as const);

export type AIDocumentToolName = (typeof AI_DOCUMENT_TOOL_NAMES)[number];
export type AIDocumentProposalStatus = 'pending' | 'accepted' | 'rejected' | 'stale';

export interface AIDocumentToolboxOptions {
  /** Tool names an agent may request. Defaults to all five tools. */
  allowedTools?: readonly AIDocumentToolName[];
  /** Maximum records returned by one read. Defaults to 500, maximum 5,000. */
  maxReadNodes?: number;
  /** Maximum mutations in one atomic proposal. Defaults to 50, maximum 500. */
  maxOperations?: number;
  /** Maximum serialized mutation payload. Defaults to 1 MiB, maximum 8 MiB. */
  maxPayloadBytes?: number;
  /** Maximum retained proposals. Defaults to 100, maximum 1,000. */
  maxProposals?: number;
  /** Permit attrs not declared by the node/mark spec. Defaults to false. */
  allowUnknownAttributes?: boolean;
}

export interface AIDocumentSchemaDescription {
  readonly topNode: string;
  readonly nodes: Readonly<Record<string, {
    readonly content?: string;
    readonly inline: boolean;
    readonly block: boolean;
    readonly atom: boolean;
    readonly attributes: readonly string[];
  }>>;
  readonly marks: Readonly<Record<string, { readonly attributes: readonly string[] }>>;
}

export interface AIDocumentReadInput {
  readonly path?: readonly number[];
  /** Descendant depth to include. Defaults to 2; 0 reads only the target. */
  readonly depth?: number;
  /** Per-call record limit, capped by `maxReadNodes`. */
  readonly limit?: number;
  /** Read a pending proposal rather than the live document. */
  readonly proposalId?: string;
}

export interface AIDocumentNodeRecord {
  readonly path: readonly number[];
  readonly type: string;
  readonly attrs: Readonly<Attributes>;
  readonly marks: readonly MarkJSON[];
  readonly childCount: number;
  readonly text?: string;
}

export interface AIDocumentReadResult {
  readonly source: 'document' | 'proposal';
  readonly proposalId?: string;
  readonly rootPath: readonly number[];
  readonly records: readonly AIDocumentNodeRecord[];
  readonly truncated: boolean;
  readonly schema: AIDocumentSchemaDescription;
}

export interface AIInsertOperation {
  readonly kind: 'insert';
  readonly parentPath: readonly number[];
  readonly index: number;
  readonly content: readonly NodeJSON[];
}

export interface AIReplaceNodeOperation {
  readonly kind: 'replace';
  readonly target: 'node';
  readonly path: readonly number[];
  readonly content: readonly NodeJSON[];
}

export interface AIReplaceTextOperation {
  readonly kind: 'replace';
  readonly target: 'text';
  readonly from: { readonly path: readonly number[]; readonly offset: number };
  readonly to: { readonly path: readonly number[]; readonly offset: number };
  readonly text: string;
}

export interface AIFormatOperation {
  readonly kind: 'format';
  readonly action: 'add' | 'remove';
  readonly from: { readonly path: readonly number[]; readonly offset: number };
  readonly to: { readonly path: readonly number[]; readonly offset: number };
  readonly mark: MarkJSON;
}

export interface AIStructureOperation {
  readonly kind: 'structure';
  readonly action: 'set-attributes' | 'remove-node';
  readonly path: readonly number[];
  readonly attrs?: Attributes;
}

export type AIDocumentMutation =
  | AIInsertOperation
  | AIReplaceNodeOperation
  | AIReplaceTextOperation
  | AIFormatOperation
  | AIStructureOperation;

export interface AIDocumentProposal {
  readonly id: string;
  readonly status: AIDocumentProposalStatus;
  readonly label?: string;
  readonly operations: readonly AIDocumentMutation[];
  readonly affectedPaths: readonly (readonly number[])[];
  readonly createdAt: number;
}

export interface AIDocumentApplyEvent {
  readonly proposalId: string;
  readonly decision: 'accepted' | 'rejected';
  readonly timestamp: number;
}

export type AIDocumentToolCall =
  | { readonly name: 'fountain.read'; readonly input?: AIDocumentReadInput }
  | { readonly name: 'fountain.insert'; readonly input: Omit<AIInsertOperation, 'kind'> }
  | { readonly name: 'fountain.replace'; readonly input: Omit<AIReplaceNodeOperation, 'kind'> | Omit<AIReplaceTextOperation, 'kind'> }
  | { readonly name: 'fountain.format'; readonly input: Omit<AIFormatOperation, 'kind'> }
  | { readonly name: 'fountain.structure'; readonly input: Omit<AIStructureOperation, 'kind'> };

export type AIDocumentToolResult =
  | { readonly kind: 'read'; readonly value: AIDocumentReadResult }
  | { readonly kind: 'proposal'; readonly value: AIDocumentProposal };

export interface AIDocumentToolDefinition {
  readonly name: AIDocumentToolName;
  readonly description: string;
  readonly mutatesOnInvocation: false;
  /** Portable JSON Schema suitable for function-calling/MCP adapters. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/** Provider-neutral descriptors. Mutation calls always produce proposals. */
const pathSchema = { type: 'array', items: { type: 'integer', minimum: 0 }, maxItems: 100 };
const pointSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'offset'],
  properties: { path: pathSchema, offset: { type: 'integer', minimum: 0 } },
};
const contentSchema = { type: 'array', items: { type: 'object' } };
const markSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: { type: { type: 'string' }, attrs: { type: 'object' } },
};

export const AI_DOCUMENT_TOOL_DEFINITIONS: readonly AIDocumentToolDefinition[] = freezeJSON([
  {
    name: 'fountain.read',
    description: 'Read bounded structured document records or a pending proposal.',
    mutatesOnInvocation: false,
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        path: pathSchema,
        depth: { type: 'integer', minimum: 0, maximum: 100 },
        limit: { type: 'integer', minimum: 1, maximum: 5_000 },
        proposalId: { type: 'string' },
      },
    },
  },
  {
    name: 'fountain.insert',
    description: 'Propose schema-valid nodes at a child index.',
    mutatesOnInvocation: false,
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['parentPath', 'index', 'content'],
      properties: { parentPath: pathSchema, index: { type: 'integer', minimum: 0 }, content: contentSchema },
    },
  },
  {
    name: 'fountain.replace',
    description: 'Propose replacing a node or an ordered text range.',
    mutatesOnInvocation: false,
    inputSchema: {
      oneOf: [
        {
          type: 'object', additionalProperties: false, required: ['target', 'path', 'content'],
          properties: { target: { const: 'node' }, path: pathSchema, content: contentSchema },
        },
        {
          type: 'object', additionalProperties: false, required: ['target', 'from', 'to', 'text'],
          properties: { target: { const: 'text' }, from: pointSchema, to: pointSchema, text: { type: 'string' } },
        },
      ],
    },
  },
  {
    name: 'fountain.format',
    description: 'Propose adding or removing a schema mark over an ordered text range.',
    mutatesOnInvocation: false,
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['action', 'from', 'to', 'mark'],
      properties: { action: { enum: ['add', 'remove'] }, from: pointSchema, to: pointSchema, mark: markSchema },
    },
  },
  {
    name: 'fountain.structure',
    description: 'Propose validated node attributes or removal of a structural node.',
    mutatesOnInvocation: false,
    inputSchema: {
      oneOf: [
        {
          type: 'object', additionalProperties: false, required: ['action', 'path', 'attrs'],
          properties: { action: { const: 'set-attributes' }, path: pathSchema, attrs: { type: 'object' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['action', 'path'],
          properties: { action: { const: 'remove-node' }, path: pathSchema },
        },
      ],
    },
  },
]) as unknown as readonly AIDocumentToolDefinition[];

interface StoredProposal {
  public: AIDocumentProposal;
  base: Node;
  transaction: Transaction;
}

let proposalCounter = 0;

function nextProposalId(): string {
  proposalCounter += 1;
  return `ai-tools-${Date.now().toString(36)}-${proposalCounter.toString(36)}`;
}

function checkedInteger(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
}

function checkedPath(value: unknown, name: string): readonly number[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every((part) => Number.isInteger(part) && part >= 0)) {
    throw new TypeError(`${name} must be a path of non-negative integers.`);
  }
  return Object.freeze([...value]) as readonly number[];
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new TypeError(`${name} contains an unknown field: ${unknown}`);
}

function validateMarkJSON(value: unknown, name: string): asserts value is MarkJSON {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a mark object.`);
  const mark = value as Record<string, unknown>;
  assertOnlyKeys(mark, ['type', 'attrs'], name);
  if (typeof mark.type !== 'string' || !mark.type) throw new TypeError(`${name}.type must be a non-empty string.`);
  if (mark.attrs !== undefined && (!mark.attrs || typeof mark.attrs !== 'object' || Array.isArray(mark.attrs))) {
    throw new TypeError(`${name}.attrs must be an object.`);
  }
}

function validateNodeJSON(value: unknown, name: string, depth = 0): asserts value is NodeJSON {
  if (depth > 100) throw new RangeError(`${name} exceeds the maximum nesting depth.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a node object.`);
  const node = value as Record<string, unknown>;
  assertOnlyKeys(node, ['type', 'attrs', 'content', 'text', 'marks'], name);
  if (typeof node.type !== 'string' || !node.type) throw new TypeError(`${name}.type must be a non-empty string.`);
  if (node.attrs !== undefined && (!node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs))) {
    throw new TypeError(`${name}.attrs must be an object.`);
  }
  if (node.text !== undefined && typeof node.text !== 'string') throw new TypeError(`${name}.text must be a string.`);
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) throw new TypeError(`${name}.marks must be an array.`);
    node.marks.forEach((mark, index) => validateMarkJSON(mark, `${name}.marks[${index}]`));
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) throw new TypeError(`${name}.content must be an array.`);
    node.content.forEach((child, index) => validateNodeJSON(child, `${name}.content[${index}]`, depth + 1));
  }
}

function portableClone<T>(value: T, name: string, maximumBytes: number): T {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); }
  catch { throw new TypeError(`${name} must be JSON-serializable.`); }
  if (serialized === undefined) throw new TypeError(`${name} must be JSON-serializable.`);
  let bytes = 0;
  for (const character of serialized) {
    const codePoint = character.codePointAt(0) as number;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  if (bytes > maximumBytes) {
    throw new RangeError(`${name} exceeds the ${maximumBytes}-byte limit.`);
  }
  return JSON.parse(serialized) as T;
}

function freezeJSON<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((child) => freezeJSON(child));
  return Object.freeze(value);
}

function describeSchema(schema: Schema): AIDocumentSchemaDescription {
  const nodes = Object.fromEntries(Object.entries(schema.nodes).map(([name, type]) => [name, Object.freeze({
    ...(type.spec.content ? { content: type.spec.content } : {}),
    inline: type.isInline,
    block: type.isBlock,
    atom: type.spec.atom === true,
    attributes: Object.freeze(Object.keys(type.spec.attrs ?? {})),
  })]));
  const marks = Object.fromEntries(Object.entries(schema.marks).map(([name, type]) => [name, Object.freeze({
    attributes: Object.freeze(Object.keys(type.spec.attrs ?? {})),
  })]));
  return Object.freeze({
    topNode: schema.topNodeType.name,
    nodes: Object.freeze(nodes),
    marks: Object.freeze(marks),
  });
}

function recordForNode(node: Node, path: readonly number[], maximumBytes: number): AIDocumentNodeRecord {
  const attrs = freezeJSON(portableClone(node.attrs, 'Node attributes', maximumBytes));
  const marks = freezeJSON(portableClone(node.marks.map((mark) => mark.toJSON()), 'Node marks', maximumBytes));
  return Object.freeze({
    path: Object.freeze([...path]),
    type: node.type.name,
    attrs,
    marks,
    childCount: node.childCount,
    ...(node.isText ? { text: node.text ?? '' } : {}),
  });
}

function assertDeclaredAttributes(
  schema: Schema,
  content: readonly NodeJSON[],
  allowUnknownAttributes: boolean,
): void {
  if (allowUnknownAttributes) return;
  const visit = (json: NodeJSON, path: readonly number[]): void => {
    const type = schema.nodes[json.type];
    if (!type) return;
    const declared = type.spec.attrs ?? {};
    const unknown = Object.keys(json.attrs ?? {}).find((name) => !(name in declared));
    if (unknown) throw new Error(`Unknown attribute ${unknown} for ${json.type} at ${path.join('.') || 'content'}.`);
    (json.marks ?? []).forEach((mark) => {
      const markType = schema.marks[mark.type];
      if (!markType) return;
      const markDeclared = markType.spec.attrs ?? {};
      const unknownMarkAttribute = Object.keys(mark.attrs ?? {}).find((name) => !(name in markDeclared));
      if (unknownMarkAttribute) throw new Error(`Unknown attribute ${unknownMarkAttribute} for mark ${mark.type}.`);
    });
    (json.content ?? []).forEach((child, index) => visit(child, [...path, index]));
  };
  content.forEach((node, index) => visit(node, [index]));
}

function nodesFromJSON(
  schema: Schema,
  content: readonly NodeJSON[],
  allowUnknownAttributes: boolean,
): readonly Node[] {
  content.forEach((node, index) => validateNodeJSON(node, `content[${index}]`));
  assertDeclaredAttributes(schema, content, allowUnknownAttributes);
  return content.map((node) => schema.nodeFromJSON(node));
}

function insertNodes(transaction: Transaction, parentPath: readonly number[], index: number, content: readonly Node[]): void {
  const parent = getNodeAtPath(transaction.doc, parentPath);
  if (parent.isText) throw new Error('Cannot insert child nodes into text.');
  checkedInteger(index, 'Insert index', 0, parent.childCount);
  if (!parentPath.length) {
    transaction.replace(index, index, content);
    return;
  }
  transaction.replaceNode(parentPath, [parent.copy([
    ...parent.content.slice(0, index),
    ...content,
    ...parent.content.slice(index),
  ])]);
}

function applyMutation(
  transaction: Transaction,
  schema: Schema,
  operation: AIDocumentMutation,
  allowUnknownAttributes: boolean,
): void {
  if (operation.kind === 'insert') {
    insertNodes(transaction, operation.parentPath, operation.index, nodesFromJSON(schema, operation.content, allowUnknownAttributes));
    return;
  }
  if (operation.kind === 'replace' && operation.target === 'node') {
    if (!operation.path.length) throw new Error('The document root cannot be replaced by an agent tool.');
    transaction.replaceNode(operation.path, nodesFromJSON(schema, operation.content, allowUnknownAttributes));
    return;
  }
  if (operation.kind === 'replace') {
    if (operation.from.path.join('.') === operation.to.path.join('.')) {
      transaction.replaceText(operation.from.path, operation.from.offset, operation.to.offset, operation.text);
    } else {
      transaction.replaceTextRange(
        operation.from.path,
        operation.from.offset,
        operation.to.path,
        operation.to.offset,
        operation.text,
      );
    }
    return;
  }
  if (operation.kind === 'format') {
    const mark = schema.markFromJSON(operation.mark);
    if (operation.action === 'add') {
      transaction.addMarkRange(
        operation.from.path,
        operation.from.offset,
        operation.to.path,
        operation.to.offset,
        mark,
      );
    } else {
      transaction.removeMarkRange(
        operation.from.path,
        operation.from.offset,
        operation.to.path,
        operation.to.offset,
        mark.type,
      );
    }
    return;
  }
  if (operation.action === 'remove-node') {
    if (!operation.path.length) throw new Error('The document root cannot be removed by an agent tool.');
    transaction.replaceNode(operation.path, []);
    return;
  }
  if (!operation.attrs || typeof operation.attrs !== 'object' || Array.isArray(operation.attrs)) {
    throw new TypeError('set-attributes requires an attrs object.');
  }
  if (!allowUnknownAttributes) {
    const node = getNodeAtPath(transaction.doc, operation.path);
    const declared = node.type.spec.attrs ?? {};
    const unknown = Object.keys(operation.attrs).find((name) => !(name in declared));
    if (unknown) throw new Error(`Unknown attribute ${unknown} for ${node.type.name}.`);
  }
  transaction.setNodeAttrs(operation.path, operation.attrs);
}

function affectedPathsFor(operation: AIDocumentMutation): readonly (readonly number[])[] {
  if (operation.kind === 'insert') return [operation.parentPath];
  if (operation.kind === 'replace' && operation.target === 'text') {
    return operation.from.path.join('.') === operation.to.path.join('.')
      ? [operation.from.path]
      : [operation.from.path, operation.to.path];
  }
  if (operation.kind === 'format') {
    return operation.from.path.join('.') === operation.to.path.join('.')
      ? [operation.from.path]
      : [operation.from.path, operation.to.path];
  }
  return [operation.path];
}

function normalizePoint(value: unknown, name: string): { readonly path: readonly number[]; readonly offset: number } {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be a text point.`);
  const point = value as { path?: unknown; offset?: unknown };
  assertOnlyKeys(point as Record<string, unknown>, ['path', 'offset'], name);
  return Object.freeze({
    path: checkedPath(point.path, `${name}.path`),
    offset: checkedInteger(point.offset, `${name}.offset`, 0, Number.MAX_SAFE_INTEGER),
  });
}

function normalizeMutation(raw: unknown, maximumBytes: number): AIDocumentMutation {
  const value = portableClone(raw, 'AI document operation', maximumBytes) as Record<string, unknown>;
  if (!value || typeof value !== 'object') throw new TypeError('AI document operation must be an object.');
  if (value.kind === 'insert') {
    assertOnlyKeys(value, ['kind', 'parentPath', 'index', 'content'], 'insert');
    if (!Array.isArray(value.content)) throw new TypeError('insert.content must be an array.');
    return freezeJSON({
      kind: 'insert',
      parentPath: checkedPath(value.parentPath, 'insert.parentPath'),
      index: checkedInteger(value.index, 'insert.index', 0, Number.MAX_SAFE_INTEGER),
      content: value.content,
    } as AIInsertOperation);
  }
  if (value.kind === 'replace' && value.target === 'node') {
    assertOnlyKeys(value, ['kind', 'target', 'path', 'content'], 'replace-node');
    if (!Array.isArray(value.content)) throw new TypeError('replace.content must be an array.');
    return freezeJSON({
      kind: 'replace',
      target: 'node',
      path: checkedPath(value.path, 'replace.path'),
      content: value.content,
    } as AIReplaceNodeOperation);
  }
  if (value.kind === 'replace' && value.target === 'text') {
    assertOnlyKeys(value, ['kind', 'target', 'from', 'to', 'text'], 'replace-text');
    if (typeof value.text !== 'string') throw new TypeError('replace.text must be a string.');
    return freezeJSON({
      kind: 'replace',
      target: 'text',
      from: normalizePoint(value.from, 'replace.from'),
      to: normalizePoint(value.to, 'replace.to'),
      text: value.text,
    } as AIReplaceTextOperation);
  }
  if (value.kind === 'format') {
    assertOnlyKeys(value, ['kind', 'action', 'from', 'to', 'mark'], 'format');
    if (value.action !== 'add' && value.action !== 'remove') throw new TypeError('format.action must be add or remove.');
    validateMarkJSON(value.mark, 'format.mark');
    return freezeJSON({
      kind: 'format',
      action: value.action,
      from: normalizePoint(value.from, 'format.from'),
      to: normalizePoint(value.to, 'format.to'),
      mark: value.mark,
    } as AIFormatOperation);
  }
  if (value.kind === 'structure') {
    assertOnlyKeys(value, ['kind', 'action', 'path', 'attrs'], 'structure');
    if (value.action !== 'set-attributes' && value.action !== 'remove-node') {
      throw new TypeError('structure.action must be set-attributes or remove-node.');
    }
    if (value.action === 'remove-node' && value.attrs !== undefined) {
      throw new TypeError('remove-node does not accept attrs.');
    }
    return freezeJSON({
      kind: 'structure',
      action: value.action,
      path: checkedPath(value.path, 'structure.path'),
      ...(value.attrs !== undefined ? { attrs: value.attrs } : {}),
    } as AIStructureOperation);
  }
  throw new TypeError('Unknown AI document operation.');
}

function withProposalStatus(proposal: AIDocumentProposal, status: AIDocumentProposalStatus): AIDocumentProposal {
  return Object.freeze({ ...proposal, status });
}

/**
 * DOM-free, provider-neutral document tools for agents. Read calls are bounded;
 * mutation calls only create proposals. A host must explicitly accept a fresh,
 * schema-valid proposal before Fountain dispatches its one undoable transaction.
 */
export class AIDocumentToolbox {
  private readonly allowedTools: ReadonlySet<AIDocumentToolName>;
  private readonly maxReadNodes: number;
  private readonly maxOperations: number;
  private readonly maxPayloadBytes: number;
  private readonly maxProposals: number;
  private readonly allowUnknownAttributes: boolean;
  private readonly proposals = new Map<string, StoredProposal>();
  readonly schema: AIDocumentSchemaDescription;

  constructor(public readonly editor: Editor, options: AIDocumentToolboxOptions = {}) {
    const allowed = options.allowedTools ?? AI_DOCUMENT_TOOL_NAMES;
    if (!Array.isArray(allowed) || allowed.some((name) => !AI_DOCUMENT_TOOL_NAMES.includes(name))) {
      throw new TypeError('allowedTools contains an unknown AI document tool.');
    }
    this.allowedTools = new Set(allowed);
    this.maxReadNodes = checkedInteger(options.maxReadNodes ?? 500, 'maxReadNodes', 1, 5_000);
    this.maxOperations = checkedInteger(options.maxOperations ?? 50, 'maxOperations', 1, 500);
    this.maxPayloadBytes = checkedInteger(options.maxPayloadBytes ?? 1_048_576, 'maxPayloadBytes', 1_024, 8_388_608);
    this.maxProposals = checkedInteger(options.maxProposals ?? 100, 'maxProposals', 1, 1_000);
    this.allowUnknownAttributes = options.allowUnknownAttributes === true;
    this.schema = describeSchema(editor.state.schema);
  }

  get definitions(): readonly AIDocumentToolDefinition[] {
    return AI_DOCUMENT_TOOL_DEFINITIONS.filter((definition) => this.allowedTools.has(definition.name));
  }

  read(input: AIDocumentReadInput = {}): AIDocumentReadResult {
    this.assertAllowed('fountain.read');
    const path = checkedPath(input.path ?? [], 'read.path');
    const depth = checkedInteger(input.depth ?? 2, 'read.depth', 0, 100);
    const limit = checkedInteger(input.limit ?? this.maxReadNodes, 'read.limit', 1, this.maxReadNodes);
    const stored = input.proposalId ? this.getStored(input.proposalId) : undefined;
    const doc = stored?.transaction.doc ?? this.editor.state.doc;
    const root = getNodeAtPath(doc, path);
    const records: AIDocumentNodeRecord[] = [];
    let truncated = false;
    const visit = (node: Node, nodePath: readonly number[], remaining: number): void => {
      if (records.length >= limit) { truncated = true; return; }
      records.push(recordForNode(node, nodePath, this.maxPayloadBytes));
      if (remaining === 0) {
        if (node.childCount) truncated = true;
        return;
      }
      for (let index = 0; index < node.childCount; index += 1) {
        visit(node.child(index), [...nodePath, index], remaining - 1);
        if (records.length >= limit && index < node.childCount - 1) truncated = true;
      }
    };
    visit(root, path, depth);
    return Object.freeze({
      source: stored ? 'proposal' : 'document',
      ...(stored ? { proposalId: stored.public.id } : {}),
      rootPath: path,
      records: Object.freeze(records),
      truncated,
      schema: this.schema,
    });
  }

  preview(operations: readonly AIDocumentMutation[], options: { readonly label?: string } = {}): AIDocumentProposal {
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > this.maxOperations) {
      throw new RangeError(`AI document proposals need 1 to ${this.maxOperations} operations.`);
    }
    const payload = portableClone(operations, 'AI document proposal', this.maxPayloadBytes);
    const normalized = payload.map((operation) => normalizeMutation(operation, this.maxPayloadBytes));
    normalized.forEach((operation) => this.assertAllowed(`fountain.${operation.kind}` as AIDocumentToolName));
    const label = options.label?.trim();
    if (label && label.length > 500) throw new RangeError('AI document proposal labels are limited to 500 characters.');

    const base = this.editor.state.doc;
    const transaction = this.editor.state.createTransaction();
    normalized.forEach((operation) => applyMutation(
      transaction,
      this.editor.state.schema,
      operation,
      this.allowUnknownAttributes,
    ));
    this.editor.state.schema.validate(transaction.doc);
    if (!transaction.docChanged) throw new Error('The AI document proposal does not change the document.');

    this.pruneTerminalProposals();
    if (this.proposals.size >= this.maxProposals) {
      throw new Error(`Too many pending AI document proposals (max ${this.maxProposals}).`);
    }
    const proposal = Object.freeze({
      id: nextProposalId(),
      status: 'pending' as const,
      ...(label ? { label } : {}),
      operations: Object.freeze(normalized),
      affectedPaths: Object.freeze(normalized.flatMap(affectedPathsFor).map((path) => Object.freeze([...path]))),
      createdAt: Date.now(),
    });
    this.proposals.set(proposal.id, { public: proposal, base, transaction });
    return proposal;
  }

  invoke(call: AIDocumentToolCall): AIDocumentToolResult {
    if (!call || typeof call !== 'object' || !AI_DOCUMENT_TOOL_NAMES.includes(call.name)) {
      throw new TypeError('Unknown AI document tool call.');
    }
    this.assertAllowed(call.name);
    if (call.name === 'fountain.read') return Object.freeze({ kind: 'read', value: this.read(call.input) });
    const operation = { kind: call.name.slice('fountain.'.length), ...call.input } as AIDocumentMutation;
    return Object.freeze({ kind: 'proposal', value: this.preview([operation]) });
  }

  getProposal(proposalId: string): AIDocumentProposal {
    return this.getStored(proposalId).public;
  }

  accept(proposalOrId: AIDocumentProposal | string): AIDocumentApplyEvent {
    const stored = this.getPending(proposalOrId);
    if (!this.editor.state.doc.eq(stored.base)) {
      stored.public = withProposalStatus(stored.public, 'stale');
      throw new Error('Cannot apply a stale AI document proposal.');
    }
    const transaction = this.editor.state.createTransaction();
    stored.transaction.steps.forEach((step) => transaction.step(step));
    transaction.setMeta('fountain$aiDocumentTools', {
      proposalId: stored.public.id,
      operations: stored.public.operations.map((operation) => operation.kind),
    });
    if (!this.editor.dispatch(transaction)) throw new Error('The host rejected the AI document proposal.');
    stored.public = withProposalStatus(stored.public, 'accepted');
    return Object.freeze({ proposalId: stored.public.id, decision: 'accepted', timestamp: Date.now() });
  }

  reject(proposalOrId: AIDocumentProposal | string): AIDocumentApplyEvent {
    const stored = this.getPending(proposalOrId);
    stored.public = withProposalStatus(stored.public, 'rejected');
    return Object.freeze({ proposalId: stored.public.id, decision: 'rejected', timestamp: Date.now() });
  }

  private assertAllowed(name: AIDocumentToolName): void {
    if (!this.allowedTools.has(name)) throw new Error(`AI document tool is not allowed: ${name}`);
  }

  private getStored(proposalId: string): StoredProposal {
    if (typeof proposalId !== 'string' || !proposalId) throw new TypeError('A proposal id is required.');
    const stored = this.proposals.get(proposalId);
    if (!stored) throw new Error(`Unknown AI document proposal: ${proposalId}`);
    return stored;
  }

  private getPending(proposalOrId: AIDocumentProposal | string): StoredProposal {
    const id = typeof proposalOrId === 'string' ? proposalOrId : proposalOrId.id;
    const stored = this.getStored(id);
    if (stored.public.status !== 'pending') {
      throw new Error(`AI document proposal ${id} is already ${stored.public.status}.`);
    }
    return stored;
  }

  private pruneTerminalProposals(): void {
    if (this.proposals.size < this.maxProposals) return;
    for (const [id, stored] of this.proposals) {
      if (stored.public.status !== 'pending') this.proposals.delete(id);
      if (this.proposals.size < this.maxProposals) return;
    }
  }
}

export function createAIDocumentToolbox(editor: Editor, options?: AIDocumentToolboxOptions): AIDocumentToolbox {
  return new AIDocumentToolbox(editor, options);
}
