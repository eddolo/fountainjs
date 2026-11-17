import { compileTemplate, parseComponent, rewriteDefault } from 'vue/compiler-sfc';

// Compile the actual integration SFC with GitLab's pinned Vue 2 compiler.
export function gitlabVue2BridgePlugin() {
  return {
    name: 'fountain-gitlab-vue2-bridge',
    enforce: 'pre',
    transform(source, id) {
      const filename = id.split('?')[0].replaceAll('\\', '/');
      if (!filename.includes('/integrations/gitlab/components/') || !filename.endsWith('.vue')) return null;
      const descriptor = parseComponent(source, { pad: 'line' });
      if (!descriptor.script || !descriptor.template || descriptor.styles.length || descriptor.customBlocks.length) {
        throw new Error('Inspect the GitLab bridge SFC: expected a script/template without inline styles or custom blocks.');
      }
      const compiled = compileTemplate({ source: descriptor.template.content, filename, id: 'fountain-gitlab', isProd: true });
      if (compiled.errors.length) throw new Error(compiled.errors.join('\n'));
      return {
        code: `${rewriteDefault(descriptor.script.content, 'component')}\n${compiled.code}\ncomponent.render = render;\ncomponent.staticRenderFns = staticRenderFns;\nexport default component;`,
        map: null,
      };
    },
  };
}
