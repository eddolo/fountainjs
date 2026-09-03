/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  EditorView,
  LeanController,
  LeanExtension,
  LeanInfoView,
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
  getLeanDiagnostics,
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
    const mount = document.createElement('div');
    const info = new LeanInfoView(mount, controller);
    expect(info.dom.textContent).toContain('No checker is configured');
    expect(info.dom.querySelector('button')).toBeNull();
    info.destroy();
    expect(mount.childElementCount).toBe(0);
    const configure = vi.fn();
    const configurable = new LeanInfoView(mount, controller, { onConfigureProvider: configure });
    (configurable.dom.querySelector('button') as HTMLButtonElement).click();
    expect(configure).toHaveBeenCalledOnce();
    configurable.destroy();
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

  it('renders transient diagnostics, maps them with the block, and clears them on source edits', async () => {
    const provider = createLeanProvider({
      descriptor: { id: 'diagnostics', label: 'Diagnostic checker', mode: 'one-shot', dataDestination: 'device' },
      check: async () => ({
        status: 'errors',
        diagnostics: [{
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
          severity: 'error',
          message: 'Unresolved theorem',
        }],
      }),
    });
    const kit = leanKit(createLeanExtension({ provider }));
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{
          type: 'code_block',
          attrs: { language: 'lean', lineNumbers: true },
          content: [{ type: 'text', text: 'theorem t : True := by trivial' }],
        }],
      },
    });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const controller = new LeanController(editor, provider);
    await controller.check();
    expect(getLeanDiagnostics(editor.state)?.result?.diagnostics).toHaveLength(1);
    expect(mount.querySelector('[data-fountain-lean-diagnostic="error"]')?.textContent).toBe('theorem');
    expect(JSON.stringify(editor.getJSON())).not.toContain('Unresolved theorem');

    const paragraph = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Before')]);
    editor.dispatch(editor.state.createTransaction().replace(0, 0, [paragraph]));
    expect(getLeanDiagnostics(editor.state)?.blockPath).toEqual([1]);
    expect(mount.querySelector('[data-fountain-lean-diagnostic="error"]')?.textContent).toBe('theorem');

    editor.dispatch(editor.state.createTransaction().insertText([1, 0], 0, 'x'));
    expect(getLeanDiagnostics(editor.state)?.decorations.decorations).toHaveLength(0);
    expect(mount.querySelector('[data-fountain-lean-diagnostic]')).toBeNull();
    view.destroy();
  });

  it('renders a safe, interactive framework-neutral InfoView', async () => {
    const provider = createLeanProvider({
      descriptor: { id: 'info', label: 'Visible local Lean', mode: 'local', dataDestination: 'device', endpoint: 'http://localhost:32100' },
      check: async () => ({
        status: 'errors',
        diagnostics: [{
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
          severity: 'error',
          message: 'Choose this diagnostic',
        }],
      }),
      goals: async () => [{ id: 'g', hypotheses: ['p : Prop'], target: 'p → p' }],
      hover: async () => ({ markdown: '<img src=x onerror=alert(1)> **Prop**' }),
      expectedType: async () => ({ markdown: 'Nat' }),
      complete: async () => [{ label: 'exact', insertText: 'exact ', detail: 'close the goal' }],
    });
    const kit = leanKit(createLeanExtension({ provider }));
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [{ type: 'code_block', attrs: { language: 'lean', lineNumbers: true }, content: [{ type: 'text', text: 'theorem t : True := by trivial' }] }] },
    });
    const controller = new LeanController(editor, provider);
    const mount = document.createElement('div');
    const info = new LeanInfoView(mount, controller);
    expect(info.dom.textContent).toContain('Visible local Lean');
    expect(info.dom.textContent).toContain('local · device');

    await controller.check();
    const diagnostic = [...info.dom.querySelectorAll('button')].find((button) => button.textContent?.includes('Choose this diagnostic'));
    diagnostic?.click();
    expect(editor.state.selection.kind).toBe('text');
    expect(editor.state.selection.from).toBe(0);
    expect(editor.state.selection.to).toBe(7);

    await controller.goals();
    expect(info.dom.textContent).toContain('p : Prop');
    expect(info.dom.textContent).toContain('⊢ p → p');
    await controller.hover();
    expect(info.dom.textContent).toContain('<img src=x onerror=alert(1)> **Prop**');
    expect(info.dom.querySelector('img')).toBeNull();
    await controller.expectedType();
    expect(info.dom.textContent).toContain('Expected type');
    expect(info.dom.textContent).toContain('Nat');
    await controller.complete();
    const completion = [...info.dom.querySelectorAll('button')].find((button) => button.textContent?.startsWith('exact'));
    completion?.click();
    expect(editor.state.doc.child(0).textContent).toBe('exact  t : True := by trivial');
    info.destroy();
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
