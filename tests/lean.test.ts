/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  EditorView,
  LeanController,
  LeanExtension,
  MarkdownExporter,
  MarkdownImporter,
  Schema,
  Selection,
  StarterKit,
  SyntaxHighlighter,
  composeExtensions,
  createEditor,
  createLeanExtension,
  createLeanProvider,
  insertLeanBlock,
  replaceLeanUnicode,
  setLeanSource,
  type LeanCheckResult,
} from '../src';

function leanKit(extension = LeanExtension) {
  return composeExtensions([...StarterKit.extensions, extension]);
}

function editorWithLean(source = 'theorem identity (p : Prop) : p → p := by\n  intro h\n  exact h') {
  const kit = leanKit();
  return createEditor({
    schema: kit.schema,
    plugins: kit.plugins,
    content: {
      type: 'doc',
      content: [{
        type: 'code_block',
        attrs: { language: 'lean', lineNumbers: true },
        content: [{ type: 'text', text: source }],
      }],
    },
  });
}

describe('first-party Lean foundation', () => {
  it('inserts and updates portable Lean code blocks with Markdown round trips', () => {
    const kit = leanKit();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    expect(insertLeanBlock(editor, 'example : True := by trivial')).toBe(true);
    expect(editor.state.doc.child(1).attrs.language).toBe('lean');
    expect(editor.state.selection.path).toEqual([1, 0]);
    expect(setLeanSource(editor, 'example : 1 = 1 := rfl')).toBe(true);
    const markdown = MarkdownExporter.export(editor.state.doc);
    expect(markdown).toContain('```lean\nexample : 1 = 1 := rfl\n```');
    const roundTrip = MarkdownImporter.parse(markdown, new Schema(kit.schema));
    expect(roundTrip.content.find((node) => node.attrs.language === 'lean')?.textContent).toBe('example : 1 = 1 := rfl');
  });

  it('expands Lean Unicode abbreviations only inside Lean blocks', () => {
    const editor = editorWithLean('example (p : Prop) : \\forall');
    editor.dispatch(editor.state.createTransaction().setSelection(
      Selection.cursor([0, 0], editor.state.doc.child(0).textContent.length),
    ));
    expect(replaceLeanUnicode(editor)).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('example (p : Prop) : ∀');

    expect(setLeanSource(editor, '\\exists')).toBe(true);
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    view.dom.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('∃');
    view.destroy();

    const plain = createEditor({ schema: StarterKit.schema, plugins: leanKit().plugins });
    expect(replaceLeanUnicode(plain)).toBe(false);
  });

  it('keeps source-only mode useful without calling or requiring a provider', async () => {
    const editor = editorWithLean();
    const controller = new LeanController(editor);
    expect(controller.getSnapshot().status).toBe('source-only');
    await expect(controller.check()).resolves.toEqual(expect.objectContaining({
      status: 'not-checked',
      diagnostics: [],
    }));
    expect(controller.getSnapshot().status).toBe('source-only');
    await expect(controller.goals()).resolves.toEqual([]);
  });

  it('requires explicit, inspectable provider trust metadata', () => {
    expect(() => createLeanProvider({
      descriptor: { id: 'bad-local', label: 'Bad local', mode: 'local', dataDestination: 'device', endpoint: 'https://example.com/lean' },
      check: async () => ({ status: 'verified', diagnostics: [] }),
    })).toThrow(/loopback/);
    expect(() => createLeanProvider({
      descriptor: { id: 'unsafe', label: 'Unsafe', mode: 'remote', dataDestination: 'self-hosted', endpoint: 'http://lean.example.com' },
      check: async () => ({ status: 'verified', diagnostics: [] }),
    })).toThrow(/HTTPS/);
    expect(() => createLeanProvider({
      descriptor: { id: 'third-party', label: 'Third party', mode: 'managed', dataDestination: 'third-party', endpoint: 'https://lean.example.com' },
      check: async () => ({ status: 'verified', diagnostics: [] }),
    })).toThrow(/data-use notice/);

    const local = createLeanProvider({
      descriptor: { id: 'local-lean', label: 'Lean on this computer', mode: 'local', dataDestination: 'device', endpoint: 'http://127.0.0.1:32100' },
      check: async () => ({ status: 'verified', diagnostics: [] }),
    });
    expect(local.descriptor).toEqual(expect.objectContaining({ mode: 'local', dataDestination: 'device' }));
  });

  it('preserves class-based provider methods and explicit lifecycle ownership', async () => {
    class LocalProvider {
      readonly descriptor = { id: 'class-local', label: 'Class local', mode: 'local' as const, dataDestination: 'device' as const };
      checks = 0;
      disposed = 0;
      async check(): Promise<LeanCheckResult> {
        this.checks += 1;
        return { status: 'verified', diagnostics: [] };
      }
      dispose(): void { this.disposed += 1; }
    }
    const original = new LocalProvider();
    const provider = createLeanProvider(original);
    const shared = new LeanController(editorWithLean(), provider);
    await shared.check();
    await shared.dispose();
    expect(original.checks).toBe(1);
    expect(original.disposed).toBe(0);

    const owned = new LeanController(editorWithLean(), provider, { disposeProvider: true });
    await owned.dispose();
    expect(original.disposed).toBe(1);
  });

  it('sends a frozen, selection-aware request only to the chosen provider', async () => {
    const check = vi.fn(async (request): Promise<LeanCheckResult> => ({
      status: 'errors',
      diagnostics: [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
        severity: 'error',
        message: `Check ${request.uri}`,
      }],
    }));
    const provider = createLeanProvider({
      descriptor: { id: 'team-lean', label: 'Team Lean', mode: 'remote', dataDestination: 'self-hosted', endpoint: 'https://lean.internal.example' },
      check,
    });
    const editor = editorWithLean();
    const controller = new LeanController(editor, provider);
    const request = controller.inspectRequest({ uri: 'file:///Main.lean' });
    expect(request.position).toEqual({ line: 0, character: 0 });
    expect(Object.isFrozen(request)).toBe(true);
    const result = await controller.check({ uri: 'file:///Main.lean' });
    expect(result.status).toBe('errors');
    expect(result.diagnostics[0]?.message).toBe('Check file:///Main.lean');
    expect(check).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({ status: 'ready', provider: provider.descriptor }));
  });

  it('rejects stale provider responses and supports goals, hover, and completion', async () => {
    let finish: ((value: LeanCheckResult) => void) | undefined;
    const provider = createLeanProvider({
      descriptor: { id: 'one-shot', label: 'One-shot checker', mode: 'one-shot', dataDestination: 'device' },
      check: () => new Promise((resolve) => { finish = resolve; }),
      goals: async () => [{ id: 'goal-1', target: 'p → p', hypotheses: ['p : Prop'] }],
      hover: async () => ({ markdown: '`Prop` is the type of propositions.' }),
      complete: async () => [{ label: 'exact', insertText: 'exact ' }],
    });
    const editor = editorWithLean();
    const controller = new LeanController(editor, provider);
    const pending = controller.check();
    expect(setLeanSource(editor, 'example : True := by trivial')).toBe(true);
    finish?.({ status: 'verified', diagnostics: [] });
    await expect(pending).rejects.toThrow(/stale/);
    expect(controller.getSnapshot().status).toBe('stale');

    await expect(controller.goals()).resolves.toEqual([expect.objectContaining({ target: 'p → p' })]);
    await expect(controller.hover()).resolves.toEqual(expect.objectContaining({ markdown: expect.stringContaining('Prop') }));
    await expect(controller.complete()).resolves.toEqual([expect.objectContaining({ label: 'exact' })]);
  });

  it('aborts active work and rejects malformed provider ranges', async () => {
    let aborted = false;
    const slow = createLeanProvider({
      descriptor: { id: 'slow', label: 'Slow local Lean', mode: 'local', dataDestination: 'device' },
      check: (_request, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('cancelled', 'AbortError'));
        }, { once: true });
      }),
    });
    const editor = editorWithLean();
    const controller = new LeanController(editor, slow);
    const pending = controller.check();
    controller.cancel();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(aborted).toBe(true);
    expect(controller.getSnapshot().status).toBe('idle');

    const malformed = new LeanController(editor, createLeanProvider({
      descriptor: { id: 'malformed', label: 'Malformed checker', mode: 'one-shot', dataDestination: 'device' },
      check: async () => ({
        status: 'errors',
        diagnostics: [{
          range: { start: { line: 99, character: 0 }, end: { line: 99, character: 1 } },
          severity: 'error',
          message: 'Outside the document',
        }],
      }),
    }));
    await expect(malformed.check()).rejects.toThrow(/exceeds/);
    expect(malformed.getSnapshot().status).toBe('error');
    expect(() => malformed.inspectRequest({ uri: 'not a URI' })).toThrow(/absolute URL/);
  });

  it('exposes source-only or explicit-provider services through composition', () => {
    const sourceOnly = leanKit();
    expect((sourceOnly.services.lean as any).mode).toBe('source-only');
    const provider = createLeanProvider({
      descriptor: { id: 'local', label: 'Local Lean', mode: 'local', dataDestination: 'device' },
      check: async () => ({ status: 'verified', diagnostics: [] }),
    });
    const configured = leanKit(createLeanExtension({ provider }));
    expect((configured.services.lean as any).mode).toBe('local');
  });

  it('recognizes Lean and Lean 4 in the built-in static highlighter', () => {
    const highlighter = new SyntaxHighlighter();
    expect(highlighter.highlight('theorem t : True := by trivial', 'lean')).toContain('fjs-token--keyword">theorem');
    expect(highlighter.highlight('example : True := by trivial', 'lean4')).toContain('fjs-token--keyword">example');
  });
});
