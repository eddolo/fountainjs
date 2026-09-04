import {
  FOUNTAIN_EXTENSION_API_VERSION,
  defineExtension,
  insertBlock,
} from '../../src';

/** A framework-neutral extension: no React, DOM view, or service dependency. */
export const CalloutExampleExtension = defineExtension({
  name: 'example-callout',
  manifest: {
    version: '1.0.0',
    apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
    displayName: 'Example callout',
    description: 'Adds a portable callout block and insertion command.',
    license: 'MIT',
    homepage: 'https://github.com/eddolo/fountainjs',
    requires: ['fountain-core'],
  },
  nodes: {
    example_callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'note' } },
      parseDOM: [{
        tag: 'aside[data-example-callout]',
        getAttrs: (element) => ({ tone: element.dataset.tone ?? 'note' }),
      }],
      toDOM: (node) => ['aside', {
        'data-example-callout': '',
        'data-tone': node.attrs.tone,
      }, 0],
      toText: (node) => node.textContent,
    },
  },
  commands: {
    insertExampleCallout: (editor, text = '') => insertBlock(editor, 'example_callout', {}, text),
  },
});
