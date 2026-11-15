import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

// Compare Fountain documents, not CommonMark's internal AST. Only opaque note
// identity is joined through the preserved source label on a fresh import.
export function footnoteRoundtripProjection(document) {
  const labels = new Map();
  document.descendants(node => {
    if (node.type.name === 'footnote_definition') {
      const id = String(node.attrs.id);
      assert.ok(!labels.has(id)); labels.set(id, node.attrs.gitlabFootnoteLabel);
    }
  });
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)])) : value;
  const project = node => {
    const attrs = { ...node.attrs };
    if (node.type.name.startsWith('footnote_')) {
      assert.ok(labels.has(String(attrs.id))); attrs.id = labels.get(String(attrs.id));
    }
    return { type: node.type.name, attrs: sort(attrs), ...(node.text === undefined ? {} : { text: node.text }),
      marks: node.marks.map(mark => sort(mark.toJSON())), content: node.content.map(project) };
  };
  return project(document);
}

/** Real source → native edit → canonical source → actual host → native reopen. */
export async function captureGitLabFootnoteRoundtrip({ root, pin, version, renderMarkdown, overlay }) {
  assert.ok(overlay?.sha256, 'Declare the exact server repair for this profile.');
  const { GitLabContentEditor, Selection, insertText } = await import(new URL('artifacts/gitlab-native-runtime/fountain-runtime.mjs', root));
  const corpus = [];
  for (const file of ['footnote-probe-live-html.json', 'footnote-editing-live-html.json']) {
    const data = JSON.parse(await readFile(new URL('integrations/gitlab/fixtures/' + file, root)));
    corpus.push(...data.fixtures.map(item => ({ name: item.name, source: item.source })));
  }
  corpus.push({ name: 'occurrence-label-collision', source: 'First[^a], other[^a-2], repeated[^a].\n\n[^a]: First body.\n\n[^a-2]: Other body.' });
  for (const name of ['simple', 'repeated', 'case', 'links-math', 'table', 'unused-multiblock', 'authored-backlink', 'empty']) {
    corpus.push({ name: name + '-body-edit', source: corpus.find(item => item.name === name).source, edit: 'body' });
  }
  const responses = new Map(), renders = [];
  const render = async input => {
    if (!responses.has(input)) {
      const response = await renderMarkdown(input);
      assert.equal(typeof response.body, 'string'); responses.set(input, response);
      renders.push({ source: input, body: response.body });
    }
    return responses.get(input);
  };
  const create = () => new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '' });
  const edit = (bridge, text, body) => {
    const { editor } = bridge, { schema } = editor.state;
    let target, empty;
    editor.state.doc.descendants((node, path) => {
      let ancestor = editor.state.doc, insideNote = false;
      for (const part of path.slice(0, -1)) {
        ancestor = ancestor.child(part);
        if (ancestor.type.name === 'footnote_definition') insideNote = true;
      }
      if (body !== insideNote) return;
      if (!target && node.isText && ['paragraph', 'heading'].includes(ancestor.type.name)) target = path;
      if (!empty && body && node.type.name === 'paragraph' && !node.childCount) empty = path;
    });
    if (target) {
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(target, 0)));
      assert.equal(insertText(editor, text + ' '), true);
      return { kind: 'insert-text', path: target };
    }
    if (empty) {
      const paragraph = empty.reduce((node, index) => node.child(index), editor.state.doc);
      assert.equal(editor.dispatch(editor.createTransaction().replaceNode(empty, [paragraph.copy([schema.text(text)])])), true);
      assert.equal(paragraph.type.name, 'paragraph');
      return { kind: 'edit-empty-body', path: empty };
    }
    assert.equal(body, false, 'A body-edit fixture must contain an editable definition paragraph.');
    const index = editor.state.doc.child(0).attrs.gitlabFrontmatter ? 1 : 0;
    // Explicit host-default presentation, instead of inventing a physical left
    // alignment or moving a frontmatter header away from the document start.
    editor.dispatch(editor.createTransaction().replace(index, index,
      [schema.node('paragraph', { dir: 'auto', align: 'start' }, [schema.text(text)])]));
    return { kind: 'insert-paragraph', path: [index] };
  };
  const fixtures = [];
  for (const item of corpus) {
    const first = create(), second = create(), third = create();
    const observed = { phase: 'load' }, result = { ...item, observed };
    try {
      await first.setSerializedContent(item.source);
      assert.equal(first.getSerializedContent(), item.source);
      observed.loaded = true;
      const original = footnoteRoundtripProjection(first.editor.state.doc);
      result.original = original;
      observed.phase = 'edit';
      result.action = edit(first, 'First round-trip edit.', item.edit === 'body');
      observed.phase = 'export';
      result.canonical = first.getSerializedContent();
      result.expected = footnoteRoundtripProjection(first.editor.state.doc);
      observed.phase = 'reopen';
      await second.setSerializedContent(result.canonical);
      result.reopened = footnoteRoundtripProjection(second.editor.state.doc);
      observed.equivalent = JSON.stringify(result.expected) === JSON.stringify(result.reopened);
      assert.equal(second.getSerializedContent(), result.canonical);
      result.secondAction = edit(second, 'Second round-trip edit.', item.edit === 'body');
      result.secondCanonical = second.getSerializedContent();
      result.secondExpected = footnoteRoundtripProjection(second.editor.state.doc);
      observed.phase = 'second-reopen';
      await third.setSerializedContent(result.secondCanonical);
      result.secondReopened = footnoteRoundtripProjection(third.editor.state.doc);
      observed.secondEquivalent = JSON.stringify(result.secondExpected) === JSON.stringify(result.secondReopened);
      observed.phase = 'complete';
    } catch (error) {
      observed.error = error.message;
      observed.issues = error.issues?.map(issue => issue.code);
      observed.originalRetained = typeof error.originalMarkdown === 'string' && error.originalMarkdown === (observed.phase === 'load' ? item.source
        : observed.phase === 'reopen' ? result.canonical : result.secondCanonical);
    } finally { first.dispose(); second.dispose(); third.dispose(); }
    fixtures.push(result);
  }
  const result = { date: new Date().toISOString(),
    scope: 'Actual pinned host round-trip diagnostics; observed outcomes require independent acceptance, not a pass oracle',
    upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision }, overlay, renders, fixtures };
  await writeFile(new URL('integrations/gitlab/fixtures/footnote-roundtrip-live-html.json', root), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ captured: fixtures.length, renders: renders.length,
    complete: fixtures.filter(item => item.observed.phase === 'complete').length,
    equivalent: fixtures.filter(item => item.observed.equivalent).length,
    secondEquivalent: fixtures.filter(item => item.observed.secondEquivalent).length,
    refusedWithOriginal: fixtures.filter(item => item.observed.originalRetained).length,
    mismatches: fixtures.filter(item => item.observed.loaded && (!item.observed.equivalent || !item.observed.secondEquivalent))
      .map(item => ({ name: item.name, ...item.observed })) }));
}
