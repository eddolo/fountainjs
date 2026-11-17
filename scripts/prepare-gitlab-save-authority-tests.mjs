import {readFile,writeFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {isAbsolute,resolve} from 'node:path';
import {tmpdir} from 'node:os';
if(process.platform!=='linux'||!isAbsolute(process.argv[2]??''))throw new Error('Pass the pinned Linux GitLab checkout.');
const root=fileURLToPath(new URL('../',import.meta.url)),source=await realpath(process.argv[2]);
const pin=JSON.parse(await readFile(resolve(root,'integrations/gitlab/runtime/upstream.json')));
if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pin.commit)throw new Error('Unexpected GitLab revision.');
const path='spec/frontend/work_items/components/work_item_detail_spec.js',target=resolve(source,path);
if(await realpath(target)!==target)throw new Error('Refusing a symlinked test input.');
const baseline=execFileSync('git',['-C',source,'show','HEAD:'+path],{encoding:'utf8'});
const anchor="    it('does not call clearDraft when description is unsuccessfully updated', async () => {";
if(baseline.split(anchor).length!==2)throw new Error('Inspect the pinned description save tests.');
const regression=`    describe('when description update authority is revoked', () => {
      let clearDraftSpy;
      let mutationHandler;

      beforeEach(async () => {
        setWindowLocation('?edit=true');
        clearDraftSpy = jest.fn();
        mutationHandler = jest.fn().mockReturnValue({
          data: {
            workItemUpdate: {
              workItem: workItemQueryResponseWithNoPermissions.data.namespace.workItem,
              errors: [],
            },
          },
        });
        createComponent({ mutationHandler });
        await mockApollo.resolveAll();
      });

      it.each(['Pending review.', ''])('keeps the %j draft and shows a failure', async (draft) => {
        findWorkItemDescription().vm.$emit('update-draft', draft);
        findWorkItemDescription().vm.$emit('update-work-item', { clearDraft: clearDraftSpy });
        await mockApollo.resolveMutation(updateWorkItemMutation);

        expect(clearDraftSpy).not.toHaveBeenCalled();
        expect(findWorkItemDescription().props('editMode')).toBe(true);
        expect(findWorkItemDescription().props('updateInProgress')).toBe(false);
        expect(findAlert().text()).toBe('You no longer have permission to edit this description. Your draft has been kept.');
      });

      it('permits retry after authority returns and removes the old warning', async () => {
        findWorkItemDescription().vm.$emit('update-draft', 'Pending review.');
        findWorkItemDescription().vm.$emit('update-work-item', { clearDraft: clearDraftSpy });
        await mockApollo.resolveMutation(updateWorkItemMutation);
        expect(findAlert().exists()).toBe(true);

        mutationHandler.mockReturnValue({
          data: {
            workItemUpdate: {
              workItem: workItemByIidQueryResponse.data.namespace.workItem,
              errors: [],
            },
          },
        });
        findWorkItemDescription().vm.$emit('update-work-item', { clearDraft: clearDraftSpy });
        await mockApollo.resolveMutation(updateWorkItemMutation);

        expect(clearDraftSpy).toHaveBeenCalledTimes(1);
        expect(findWorkItemDescription().props('editMode')).toBe(false);
        expect(wrapper.text()).not.toContain('You no longer have permission to edit this description. Your draft has been kept.');
      });
    });

`;
const require=createRequire(resolve(source,'package.json')),prettier=require('prettier');
const options=await prettier.resolveConfig(target);
const value=await prettier.format(baseline.replace(anchor,regression+anchor),{...options,filepath:target,plugins:(options.plugins??[]).map(name=>require.resolve(name)),tailwindConfig:resolve(source,options.tailwindConfig)});
const current=await readFile(target,'utf8');if(current!==baseline&&current!==value)throw new Error('Refusing unrecognized description Save test edits.');
await writeFile(target,value);
const temporary=await mkdtemp(resolve(tmpdir(),'fountain-save-authority-'));
try{
 const before=resolve(temporary,'before');await writeFile(before,baseline);let diff;
 try{diff=execFileSync('git',['diff','--no-index','--unified=2','--',before,target],{encoding:'utf8'});}catch(error){if(error.status!==1)throw error;diff=error.stdout;}
 const patch=diff.split('\n').map(line=>line.startsWith('diff --git ')?`diff --git a/${path} b/${path}`:line.startsWith('--- ')?`--- a/${path}`:line.startsWith('+++ ')?`+++ b/${path}`:line).join('\n');
 await writeFile(resolve(root,'integrations/gitlab/patches/gitlab-19.5.3-native-save-authority-tests.patch'),patch);
 console.log('Prepared three upstream description Save authority/retry regressions.');
}finally{await rm(temporary,{recursive:true,force:true});}
