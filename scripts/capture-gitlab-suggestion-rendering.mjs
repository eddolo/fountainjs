import { writeFile } from 'node:fs/promises';

export async function captureGitLabSuggestionRendering({ root, pin, version, renderMarkdown }) {
  const cases = [
    ['single', '```suggestion\nreturn true;\n```'],
    ['range', '```suggestion:-2+1\nfirst();\nsecond();\n```'],
    ['one-blank-line', '```suggestion:-0+0\n\n```'],
    ['two-blank-lines', '```suggestion:-0+0\n\n\n```'],
    ['crlf', '```suggestion:-1+0\r\nline\r\n```'],
    ['tilde', '~~~suggestion:-0+0\n~literal~\n~~~'],
    ['mixed-whitespace', '```suggestion:-0+0\n\u00a0\t\u3000\n```'],
    ['literal-tab', '```suggestion:-0+0\na\tb\n```'],
    ['nbsp', '```suggestion:-0+0\n\u00a0\n```'],
    ['ideographic-space', '```suggestion:-0+0\n\u3000\n```'],
    ['trailing-spaces', '```suggestion:-0+0\nkeep();  \n```'],
    ['empty', '```suggestion:-0+0\n```'],
    ['blank-lines', '```suggestion:-1+0\n\n  keepIndent();\n\n```'],
    ['literal-unicode', '```suggestion:-0+0\nconst key = "A\u200bB";\n```'],
    ['literal-html', '```suggestion:-0+0\n<div>&value</div>\n```'],
    ['inner-fence', '````suggestion:-0+0\n```js\nx();\n```\n````'],
    ['quoted', '> ```suggestion:-0+0\n> replacement\n> ```'],
    ['nested-list', '- Review\n\n  ```suggestion:-0+0\n  replacement\n  ```'],
    ['two', '```suggestion:-1+0\nfirst\n```\n\n```suggestion:-0+2\nsecond\n```'],
    ['invalid-offset', '```suggestion:wrong\nsource\n```'],
    ['offset-spaces', '```suggestion:-1+0 extra\nsource\n```'],
  ];
  const fixtures = [];
  for (const [name, source] of cases) {
    const response = await renderMarkdown(source);
    if (typeof response.body !== 'string') throw new Error('Missing actual suggestion rendering.');
    fixtures.push({ name, source, body: response.body });
  }
  await writeFile(new URL('integrations/gitlab/fixtures/suggestion-live-html.json', root), JSON.stringify({
    scope: 'Actual pinned project-preview responses. Does not prove MR suggestion application or inline review acceptance.',
    upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision }, fixtures,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ captured: fixtures.length, kind: 'suggestions' }));
}
