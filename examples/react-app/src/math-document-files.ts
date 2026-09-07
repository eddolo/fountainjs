import type { Editor, Node, NodeJSON, Schema } from 'fountainjs-editor';

export const MAX_EQUATION_FILE_BYTES = 2 * 1024 * 1024;

export function replaceEquationDocument(editor: Editor, document: Node): boolean {
  return editor.dispatch(editor.state.createTransaction().replaceDocument(document));
}

/** Host file boundary; never modify the live editor until parsing succeeds. */
export function parseEquationDocument(source: string, schema: Schema): Node {
  if (new TextEncoder().encode(source).byteLength > MAX_EQUATION_FILE_BYTES) throw new Error('Document exceeds the 2 MiB file limit.');
  const value: unknown = JSON.parse(source);
  // Bound nesting before the recursive schema parser. This also bounds nested
  // attributes rather than assuming only the content tree can be adversarial.
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let objects = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (!entry.value || typeof entry.value !== 'object') continue;
    if (++objects > 20_000 || entry.depth > 64) throw new Error('Document exceeds this lab’s nesting or object limit.');
    for (const child of Object.values(entry.value)) pending.push({ value: child, depth: entry.depth + 1 });
  }
  if (!value || typeof value !== 'object' || (value as NodeJSON).type !== 'doc') throw new Error('Expected a Fountain document JSON root (type: doc).');
  const doc = schema.nodeFromJSON(value as NodeJSON);
  // Reject discarded fields rather than quietly losing source/metadata.
  // Schema defaults may legitimately appear in the parsed result.
  const containsInput = (input: unknown, output: unknown): boolean => {
    if (input === null || typeof input !== 'object') return input === output;
    if (!output || typeof output !== 'object' || Array.isArray(input) !== Array.isArray(output)) return false;
    if (Array.isArray(input) && input.length !== (output as unknown[]).length) return false;
    return Object.entries(input).every(([key, child]) => {
      if (Object.hasOwn(output, key)) return containsInput(child, (output as Record<string, unknown>)[key]);
      // Canonical JSON omits empty known fields on nodes/marks. Omission is not
      // data loss; unknown keys and nonempty discarded fields still fail.
      if (typeof (input as { type?: unknown }).type !== 'string') return false;
      return (['content', 'marks'].includes(key) && Array.isArray(child) && !child.length)
        || (key === 'attrs' && child !== null && typeof child === 'object' && !Array.isArray(child) && !Object.keys(child).length);
    });
  };
  if (!containsInput(value, doc.toJSON())) throw new Error('Document contains fields this schema would discard; the file was not opened.');
  return doc;
}

export function nextEquationLabel(doc: Node, after: number): { label: string; counter: number } {
  const sources: string[] = [];
  doc.descendants(node => { if (['math_block', 'inline_math'].includes(node.type.name)) sources.push(String(node.attrs.latex)); });
  let counter = after;
  let label: string;
  do { label = `eq:extra-${++counter}`; } while (sources.some(source => source.includes(label)));
  return { label, counter };
}

export function downloadDocumentFile(owner: Document, filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = owner.createElement('a');
  link.href = url;
  link.download = filename;
  owner.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
