import {test,expect,type Page} from '@playwright/test';
/** Evidence that browser input reached the compiled project, not a source-only fixture. */
export function auditCompiledRuntime(...entries: string[]){
 const required=entries.length?entries:['/artifacts/cursor-overlay-build-20261106/engine.js'];
 const requests=new WeakMap<Page,string[]>();
 test.beforeEach(({page})=>{const paths:string[]=[];requests.set(page,paths);page.on('request',request=>{const path=new URL(request.url()).pathname;if(/\.(?:js|ts)$/.test(path))paths.push(path)})});
 test.afterEach(async({page},info)=>{const paths=requests.get(page)??[];await info.attach('runtime-modules',{body:JSON.stringify(paths,null,2),contentType:'application/json'});if(info.status==='passed'){for(const entry of required)expect(paths).toContain(entry);expect(paths.filter(path=>path.startsWith('/src/'))).toEqual([])}requests.delete(page)});
}
