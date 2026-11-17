import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gitlabVue2BridgePlugin} from '../tools/gitlab-bridge/vite-plugin.mjs';
const filename=fileURLToPath(new URL('../integrations/gitlab/components/fountain_editor_surface.vue',import.meta.url)).replaceAll('\\','/');
it('keeps actual native surface CSS in the compiled browser fixture',()=>{
 const plugin=gitlabVue2BridgePlugin();const source=readFileSync(filename,'utf8');
 const result=plugin.transform(source,filename+'?gitlab-vue2');expect(result).not.toBeNull();
 const styleId=JSON.parse(result!.code.match(/import ("[^"\n]+\.css");/)![1]!);
 expect(plugin.resolveId(styleId)).toBe(styleId);
 expect(plugin.load(styleId)).toContain('[data-fountain-gitlab-task-state-toggle]');
 expect(plugin.transform(plugin.load(styleId)!,styleId)).toBeNull();
});
it.each(['<style scoped>.x{color:red}</style>','<style src="external.css"></style>','<style lang="scss">.x{color:red}</style>','<docs>Custom block</docs>'])('refuses unsupported SFC contract %s',extra=>{
 const plugin=gitlabVue2BridgePlugin();
 expect(()=>plugin.transform('<script>export default {};</script><template><div /></template>'+extra,filename)).toThrow('Inspect the GitLab bridge SFC');
});
it('still rejects a missing template rather than accepting compiled JavaScript as an SFC',()=>{
 expect(()=>gitlabVue2BridgePlugin().transform('<script>export default {};</script>',filename)).toThrow('Inspect the GitLab bridge SFC');
});
