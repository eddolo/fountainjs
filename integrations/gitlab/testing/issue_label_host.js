// Installed only on the custom-host acceptance build. GitLab owns label resolution.
export const issueLabelHost = {
  extensions: [{
    name: 'issue-label',
    marks: {
      keyboard_shortcut: {
        parseHTML: [{tag:'kbd', priority:400}],
        toDOM: () => ['kbd', {'data-fountain-custom-shortcut':'true'}, 0],
      },
    },
    nodes: {
      issue_label: {
        group: 'inline', inline: true, atom: true,
        attrs: { token: {}, title: {} },
        parseHTML: [{
          tag: 'a[data-reference-type="label"][data-original]', priority: 400,
          getAttrs: el => ({ token: el.getAttribute('data-original'), title: el.textContent }),
        }],
        toDOM: node => ['span', { 'data-fountain-custom-label': node.attrs.token }, node.attrs.title],
      },
    },
  }],
  serializerConfig: {
    marks: {keyboard_shortcut:{open:'<kbd>',close:'</kbd>'}},
    nodes: {
      issue_label: {
        toMarkdown(node) {
          if (!node.attrs.token.startsWith('~')) throw new Error('Expected a GitLab label reference.');
          return node.attrs.token;
        },
      },
    },
  },
};
