import { describe, expect, it } from 'vitest';
import {
  AIDocumentToolbox,
  CoreSchemaSpec,
  createAIDocumentToolbox,
  createEditor,
  historyPlugin,
  undo,
} from '../src';

function makeEditor() {
  return createEditor({
    schema: CoreSchemaSpec,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Alpha beta' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    },
    plugins: [historyPlugin],
  });
}

describe('schema-aware AI document tools', () => {
  it('describes the live schema and performs a bounded structured read', () => {
    const tools = createAIDocumentToolbox(makeEditor(), { maxReadNodes: 3 });
    const result = tools.read({ depth: 5 });

    expect(tools.definitions.map((definition) => definition.name)).toEqual([
      'fountain.read',
      'fountain.insert',
      'fountain.replace',
      'fountain.format',
      'fountain.structure',
    ]);
    expect(result.source).toBe('document');
    expect(result.schema.topNode).toBe('doc');
    expect(result.schema.nodes.paragraph).toMatchObject({ content: 'inline*', block: true });
    expect(result.schema.marks.strong).toBeDefined();
    expect(result.records.map((record) => [record.path, record.type])).toEqual([
      [[], 'doc'],
      [[0], 'paragraph'],
      [[0, 0], 'text'],
    ]);
    expect(result.truncated).toBe(true);
  });

  it('previews insertion without mutation, exposes the candidate, and accepts as one undo step', () => {
    const editor = makeEditor();
    const tools = new AIDocumentToolbox(editor);
    const proposal = tools.preview([{
      kind: 'insert',
      parentPath: [],
      index: 1,
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Inserted' }] }],
    }], { label: 'Add a section' });

    expect(editor.getText()).toBe('Alpha beta\nSecond');
    expect(proposal).toMatchObject({ status: 'pending', label: 'Add a section' });
    expect(proposal.affectedPaths).toEqual([[]]);
    expect(tools.read({ proposalId: proposal.id, path: [1], depth: 1 }).records).toMatchObject([
      { type: 'heading', attrs: { level: 2 } },
      { type: 'text', text: 'Inserted' },
    ]);

    tools.accept(proposal);
    expect(tools.getProposal(proposal.id).status).toBe('accepted');
    expect(editor.getJSON().content?.[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('Alpha beta\nSecond');
  });

  it('previews an atomic replace, format, and structural-attribute batch', () => {
    const editor = makeEditor();
    const tools = createAIDocumentToolbox(editor);
    const proposal = tools.preview([
      {
        kind: 'replace',
        target: 'text',
        from: { path: [0, 0], offset: 0 },
        to: { path: [0, 0], offset: 5 },
        text: 'Clear',
      },
      {
        kind: 'format',
        action: 'add',
        from: { path: [0, 0], offset: 0 },
        to: { path: [0, 0], offset: 5 },
        mark: { type: 'strong' },
      },
      {
        kind: 'structure',
        action: 'set-attributes',
        path: [1],
        attrs: { align: 'center' },
      },
    ]);

    expect(editor.getText()).toBe('Alpha beta\nSecond');
    tools.accept(proposal.id);
    expect(editor.getText()).toBe('Clear beta\nSecond');
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'strong' }]);
    expect(editor.getJSON().content?.[1]?.attrs).toMatchObject({ align: 'center' });
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('Alpha beta\nSecond');
  });

  it('maps provider-neutral tool calls to read results and non-mutating proposals', () => {
    const editor = makeEditor();
    const tools = createAIDocumentToolbox(editor);
    const read = tools.invoke({ name: 'fountain.read', input: { path: [0], depth: 0 } });
    const proposed = tools.invoke({
      name: 'fountain.replace',
      input: {
        target: 'text',
        from: { path: [0, 0], offset: 6 },
        to: { path: [0, 0], offset: 10 },
        text: 'gamma',
      },
    });

    expect(read).toMatchObject({ kind: 'read', value: { records: [{ type: 'paragraph' }] } });
    expect(proposed).toMatchObject({ kind: 'proposal', value: { status: 'pending', affectedPaths: [[0, 0]] } });
    expect(editor.getText()).toBe('Alpha beta\nSecond');
  });

  it('rejects a proposal without editing', () => {
    const editor = makeEditor();
    const tools = createAIDocumentToolbox(editor);
    const proposal = tools.preview([{
      kind: 'structure', action: 'remove-node', path: [1],
    }]);
    expect(tools.reject(proposal)).toMatchObject({ proposalId: proposal.id, decision: 'rejected' });
    expect(tools.getProposal(proposal.id).status).toBe('rejected');
    expect(editor.getText()).toBe('Alpha beta\nSecond');
    expect(() => tools.accept(proposal)).toThrow(/already rejected/);
  });

  it('fails closed when the live document changed after preview', () => {
    const editor = makeEditor();
    const tools = createAIDocumentToolbox(editor);
    const proposal = tools.preview([{
      kind: 'replace',
      target: 'text',
      from: { path: [0, 0], offset: 0 },
      to: { path: [0, 0], offset: 5 },
      text: 'Proposed',
    }]);
    editor.dispatch(editor.state.createTransaction().replaceText([1, 0], 0, 6, 'Changed'));

    expect(() => tools.accept(proposal)).toThrow(/stale/);
    expect(tools.getProposal(proposal.id).status).toBe('stale');
    expect(editor.getText()).toBe('Alpha beta\nChanged');
  });

  it('rejects invalid paths, unknown schema content, invalid marks, and no-op proposals', () => {
    const tools = createAIDocumentToolbox(makeEditor());
    expect(() => tools.read({ path: [-1] })).toThrow(/path/);
    expect(() => tools.preview([{
      kind: 'insert', parentPath: [], index: 0, content: [{ type: 'missing' }],
    }])).toThrow(/Unknown node type/);
    expect(() => tools.preview([{
      kind: 'format',
      action: 'add',
      from: { path: [0, 0], offset: 0 },
      to: { path: [0, 0], offset: 5 },
      mark: { type: 'missing' },
    }])).toThrow(/Unknown mark type/);
    expect(() => tools.preview([{
      kind: 'replace',
      target: 'text',
      from: { path: [0, 0], offset: 0 },
      to: { path: [0, 0], offset: 5 },
      text: 'Alpha',
    }])).toThrow(/does not change/);
  });

  it('rejects a final document that violates the host schema', () => {
    const tools = createAIDocumentToolbox(makeEditor());
    expect(() => tools.preview([{
      kind: 'replace', target: 'node', path: [0], content: [{ type: 'text', text: 'illegal root text' }],
    }])).toThrow(/Content of doc/);
    expect(() => tools.preview([{
      kind: 'structure', action: 'remove-node', path: [0],
    }, {
      kind: 'structure', action: 'remove-node', path: [0],
    }])).toThrow(/editable text position|Content of doc/);
  });

  it('enforces tool allowlists and resource bounds', () => {
    const editor = makeEditor();
    const tools = createAIDocumentToolbox(editor, {
      allowedTools: ['fountain.read', 'fountain.replace'],
      maxOperations: 1,
      maxPayloadBytes: 1_024,
    });
    expect(tools.definitions.map((definition) => definition.name)).toEqual(['fountain.read', 'fountain.replace']);
    expect(() => tools.preview([{
      kind: 'insert', parentPath: [], index: 0, content: [{ type: 'paragraph' }],
    }])).toThrow(/not allowed/);
    expect(() => tools.preview([
      {
        kind: 'replace', target: 'text', from: { path: [0, 0], offset: 0 }, to: { path: [0, 0], offset: 1 }, text: 'A',
      },
      {
        kind: 'replace', target: 'text', from: { path: [1, 0], offset: 0 }, to: { path: [1, 0], offset: 1 }, text: 'S',
      },
    ])).toThrow(/1 to 1/);
    expect(() => tools.preview([{
      kind: 'replace', target: 'text', from: { path: [0, 0], offset: 0 }, to: { path: [0, 0], offset: 1 }, text: 'x'.repeat(2_000),
    }])).toThrow(/byte limit/);
  });

  it('rejects undeclared attributes by default and allows an explicit extensible schema policy', () => {
    const editor = makeEditor();
    const strict = createAIDocumentToolbox(editor);
    expect(() => strict.preview([{
      kind: 'structure', action: 'set-attributes', path: [0], attrs: { invented: true },
    }])).toThrow(/Unknown attribute invented/);

    const extensible = createAIDocumentToolbox(editor, { allowUnknownAttributes: true });
    const proposal = extensible.preview([{
      kind: 'structure', action: 'set-attributes', path: [0], attrs: { invented: true },
    }]);
    extensible.accept(proposal);
    expect(editor.getJSON().content?.[0]?.attrs).toMatchObject({ invented: true });
  });
});
