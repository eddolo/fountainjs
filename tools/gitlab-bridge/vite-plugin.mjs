import { compileTemplate, parseComponent, rewriteDefault } from 'vue/compiler-sfc';

// Compile the actual integration SFC with GitLab's pinned Vue 2 compiler.
export function gitlabVue2BridgePlugin() {
  const styles = new Map();
  return {
    name: 'fountain-gitlab-vue2-bridge',
    enforce: 'pre',
    resolveId(id) { return styles.has(id) ? id : null; },
    load(id) { return styles.get(id) ?? null; },
    transform(source, id) {
      const filename = id.split('?')[0].replaceAll('\\', '/');
      if (!filename.includes('/integrations/gitlab/components/') || !filename.endsWith('.vue')) return null;
      const descriptor = parseComponent(source, { pad: 'line' });
      if (!descriptor.script || !descriptor.template || descriptor.customBlocks.length
        || descriptor.styles.some(block => Object.keys(block.attrs ?? {}).length > 0)) {
        throw new Error('Inspect the GitLab bridge SFC: expected a script/template, plain CSS and no custom blocks.');
      }
      const imports = descriptor.styles.map((block, index) => {
        const styleId = `${filename}.gitlab-vue2-style-${index}.css`;
        styles.set(styleId, block.content);
        return `import ${JSON.stringify(styleId)};`;
      }).join('\n');
      const compiled = compileTemplate({ source: descriptor.template.content, filename, id: 'fountain-gitlab', isProd: true });
      if (compiled.errors.length) throw new Error(compiled.errors.join('\n'));
      return {
        code: `${imports}\n${rewriteDefault(descriptor.script.content, 'component')}\n${compiled.code}\ncomponent.render = render;\ncomponent.staticRenderFns = staticRenderFns;\nexport default component;`,
        map: null,
      };
    },
  };
}
