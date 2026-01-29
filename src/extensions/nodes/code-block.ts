import { NodeSpec } from '../../core/schema/node-spec';

export const CodeBlockNodeSpec: NodeSpec = {
  name: 'code-block',
  group: 'block',
  atom: false,
  code: true,
  attrs: {
    language: { default: 'javascript' },
    lineNumbers: { default: false },
  },
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full',
      getAttrs(dom: any) {
        return {
          language: dom.getAttribute('data-language') || 'javascript',
          lineNumbers: dom.getAttribute('data-line-numbers') === 'true',
        };
      },
    },
  ],
  toDOM() {
    return [
      'pre',
      {
        'data-language': this.attrs.language,
        'data-line-numbers': this.attrs.lineNumbers ? 'true' : 'false',
        class: `language-${this.attrs.language}`,
      },
      ['code', 0],
    ];
  },
};

export const codeBlock = {
  ...CodeBlockNodeSpec,
  isInline: false,
};
