// Installed only on the custom-host acceptance build. GitLab owns label resolution.
export const issueLabelHost = {
  extensions: [{
    name: 'issue-label',
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
