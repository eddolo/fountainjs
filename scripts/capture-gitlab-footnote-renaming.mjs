import { readFile, writeFile } from 'node:fs/promises';

/** Real renderer responses for diagnosis; observed outcomes are not acceptance. */
export async function captureGitLabFootnoteRenaming({ root, pin, version, renderMarkdown }) {
  const { GitLabContentEditor, NodeSelection } = await import(new URL('artifacts/gitlab-native-runtime/fountain-runtime.mjs', root));
  const corpus = JSON.parse(await readFile(new URL('integrations/gitlab/fixtures/footnote-probe-live-html.json', root)));
  const get = name => corpus.fixtures.find(item => item.name === name).source;
  const two = 'Body[^a] and[^b].\n\n[^a]: First body.\n\n[^b]: Second body.';
  const cases = [
    ['simple', get('simple'), 'research'], ['repeated', get('repeated'), 'note-β'],
    ['case-aliases', get('case'), 'evidence'], ['unused', get('unreferenced'), 'archived'],
    ['nested-reference', get('definition-reference'), 'changed'], ['math-link', get('links-math'), '研究'],
    ['table', get('table'), 'table-note'], ['backslash', get('simple'), 'new\\label'],
    ['percent', get('simple'), 'a%41'], ['exact-collision', two, 'b'],
    ['case-collision', two, 'B'], ['entity-collision', two, '&#98;'],
    ['invalid-space', get('simple'), 'two words'], ['invalid-bracket', get('simple'), 'a[b'],
    ['unresolved-literal', 'Unresolved[^new] and body[^a].\n\n[^a]: Keep body.', 'new'],
    ['verbatim-literal', 'Literal `[^new]` and body[^a].\n\n[^a]: Keep body.', 'new'],
    ['unrelated-prefix', get('simple'), 'research', 'prefix'],
  ];
  const fixtures = [];
  for (const [name, source, label, edit] of cases) {
    const renders = [];
    const bridge = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async input => {
      const response = await renderMarkdown(input);
      if (typeof response.body !== 'string') throw new Error('Missing actual renderer body.');
      renders.push({ source: input, body: response.body }); return response;
    } });
    try {
      await bridge.setSerializedContent(source);
      let target;
      bridge.editor.state.doc.descendants((node, path) => {
        if (!target && node.type.name === 'footnote_definition') target = { path, label: node.attrs.gitlabFootnoteLabel };
      });
      if (!target) throw new Error('Missing source definition.');
      bridge.editor.dispatch(bridge.editor.createTransaction().setSelection(new NodeSelection(bridge.editor.state.doc, target.path)));
      const session = bridge.beginFootnoteRename();
      if (edit === 'prefix') {
        const schema = bridge.editor.state.schema;
        bridge.editor.dispatch(bridge.editor.createTransaction().replace(0, 0,
          [schema.node('paragraph', {}, [schema.text('Prefix paragraph.')])]));
      }
      const before = bridge.editor.state.doc;
      let outcome, error;
      try { outcome = (await session.apply(label)).status; }
      catch (failure) { outcome = 'refused'; error = failure.message; }
      fixtures.push({ name, source, from: target.label, label, edit, renders, observed: { outcome, error,
        documentUnchanged: bridge.editor.state.doc.eq(before), markdown: bridge.getSerializedContent() } });
    } finally { bridge.dispose(); }
  }
  await writeFile(new URL('integrations/gitlab/fixtures/footnote-renaming-live-html.json', root), JSON.stringify({
    scope: 'Authenticated pinned renderer responses; observed draft outcomes are diagnostic, not independent acceptance',
    upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision }, fixtures,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ captured: fixtures.length, requests: fixtures.reduce((sum, item) => sum + item.renders.length, 0),
    outcomes: fixtures.map(item => ({ name: item.name, ...item.observed, markdown: undefined })) }));
}
