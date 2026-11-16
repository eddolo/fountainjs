import { writeFile } from 'node:fs/promises';

/** Capture the pinned host's output without inferring acceptance from its rendering. */
export async function captureGitLabTaskRendering({ root, pin, version, renderMarkdown }) {
  const cases = [
    ['plain', '- [ ] Verify deployment\n- [x] Review migration'],
    ['marked', '- [ ] **Bold** and `code`\n- [x] [Link](https://example.com)'],
    ['nested', '- [ ] Parent\n  - [x] Child\n  - [ ] **Leaf**'],
    ['loose', '- [ ] First\n\n  Follow-up paragraph.\n\n- [x] Second'],
    ['empty', '- [ ]\n- [x]'],
    ['extra-source-spaces', '- [ ]   Keep extra source spaces'],
    ['authored-space-entities', '- [ ] &#32;&#32;Keep two spaces'],
    ['authored-nbsp', '- [ ] &#160;Keep NBSP'],
    ['authored-tab', '- [ ] &#9;Keep tab'],
    ['continuation', '- [ ] First line\n  second line'],
    ['quote', '- [ ] First\n\n  > Quoted follow-up'],
    ['nested-authored-newline', '- [ ] Parent&#10;\n  - [x] Child'],
    ['nested-marked', '- [ ] **Parent**\n  - [x] Child'],
    ['tight-quote', '- [ ] First\n  > Quoted follow-up'],
    ["nested-escaped-newline", "- [ ] Parent\\&#10;\n  - [x] Child"],
    ["nested-hex-newline", "- [ ] Parent&#x0A;\n  - [x] Child"],
    ["nested-named-newline", "- [ ] Parent&NewLine;\n  - [x] Child"],
  ];
  const fixtures = [];
  for (const [name, source] of cases) {
    const response = await renderMarkdown(source);
    if (typeof response.body !== 'string') throw new Error('Missing actual task rendering.');
    fixtures.push({ name, source, body: response.body });
  }
  await writeFile(new URL('integrations/gitlab/fixtures/task-live-html.json', root), JSON.stringify({
    scope: 'Authenticated pinned renderer responses; no inferred import or round-trip acceptance.',
    upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision }, fixtures,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ captured: fixtures.length, kind: 'tasks' }));
}
