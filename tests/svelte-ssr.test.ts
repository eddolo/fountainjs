import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';

it('server-renders the packaged Svelte binding without DOM, editor construction or provider setup', async () => {
  expect(typeof document).toBe('undefined');
  const source = `<script>
    import { createFountain, fountainState, fountainEditor } from 'fountainjs-editor/svelte';
    const editor = createFountain(() => { throw new Error('SSR must not create an editor'); });
    const snapshot = fountainState(editor);
  </script>
  <div use:fountainEditor={{ editor: $editor }}></div>
  <output>{$snapshot === null ? 'inert' : 'unexpected editor'}</output>`;
  const compiled = compile(source, { generate: 'server', filename: 'SvelteSSR.svelte' });
  // Generated compiler output is imported in Node with real installed packages,
  // not a fake DOM or a mocked lifecycle. Absolute imports support a data URL.
  const code = compiled.js.code.replace(/from (['"])([^'"]+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
  const Component = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
  const result = await render(Component);
  expect(result.body).toContain('<div></div>');
  expect(result.body).toContain('inert');
  expect(result.body).not.toContain('contenteditable');
});
