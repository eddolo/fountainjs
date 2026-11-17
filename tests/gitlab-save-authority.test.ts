import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';
import {prepareGitLabSaveAuthority,prepareGitLabSaveBaseline} from '../integrations/gitlab/services/save_authority_patch.mjs';
const source=readFileSync(new URL('../integrations/gitlab/fixtures/work-item-detail-upstream.vue',import.meta.url),'utf8');
interface Host {
 draftData:{description?:string|null;title?:string};workItem:{id:string};glFeatures:{workItemFeaturesField:boolean};
 editMode:boolean;updateInProgress:boolean;updateError:string|null;
 $apollo:{mutate:(options:unknown)=>Promise<unknown>};
}
function setup(permission:boolean|undefined,description:string|null|undefined='Pending review.',prepared=true){
 const code=prepared?prepareGitLabSaveAuthority(source):source;
 const start=code.indexOf('    async updateWorkItem({ clearDraft } = {}) {'),end=code.indexOf('    cancelEditing() {',start);
 const capture=vi.fn(),clearDraft=vi.fn();
 const method:(this:Host,options:{clearDraft:()=>void})=>Promise<void>=runInNewContext('({'+code.slice(start,end)+'}).updateWorkItem',{updateWorkItemMutation:'workItemUpdate',Sentry:{captureException:capture},s__:(value:string)=>value.split('|').at(-1)});
 const mutate=vi.fn().mockResolvedValue({data:{workItemUpdate:{errors:[],workItem:{id:'record',userPermissions:{updateWorkItem:permission},description:'Server-normalized source'}}}});
 const host:Host={draftData:{description},workItem:{id:'record'},glFeatures:{workItemFeaturesField:false},editMode:true,updateInProgress:false,updateError:null,$apollo:{mutate}};
 return {host,mutate,clearDraft,capture,save:()=>method.call(host,{clearDraft})};
}
it('reproduces the pinned host clearing a draft after a success-shaped revoked response',async()=>{
 const t=setup(false,'Pending review.',false);await t.save();expect(t.clearDraft).toHaveBeenCalledOnce();expect(t.host.editMode).toBe(false);expect(t.host.updateError).toBeNull();
});
it.each(['Pending review.',''])('retains a submitted description %j when returned authority is explicitly revoked',async draft=>{
 const t=setup(false,draft);await t.save();expect(t.clearDraft).not.toHaveBeenCalled();expect(t.host.editMode).toBe(true);expect(t.host.draftData.description).toBe(draft);expect(t.host.updateError).toBe('You no longer have permission to edit this description. Your draft has been kept.');expect(t.host.updateInProgress).toBe(false);expect(t.capture).not.toHaveBeenCalled();
});
it.each(['Pending review.','','/label ~verified'])('permits authorized source %j even when the server normalizes it',async draft=>{
 const t=setup(true,draft);await t.save();expect(t.clearDraft).toHaveBeenCalledOnce();expect(t.host.editMode).toBe(false);expect(t.host.updateError).toBeNull();expect(t.capture).not.toHaveBeenCalled();
});
it('clears the old warning only when a new attempt succeeds after authority returns',async()=>{
 const t=setup(false);await t.save();expect(t.host.updateError).toContain('Your draft has been kept.');t.mutate.mockResolvedValueOnce({data:{workItemUpdate:{errors:[],workItem:{userPermissions:{updateWorkItem:true}}}}});await t.save();expect(t.clearDraft).toHaveBeenCalledOnce();expect(t.host.editMode).toBe(false);expect(t.host.updateError).toBeNull();
});
it.each([null,undefined])('does not expand this description guard to an absent description %j',async description=>{
 const t=setup(false,description);if(description===undefined)t.host.draftData.description=undefined;await t.save();expect(t.clearDraft).toHaveBeenCalledOnce();expect(t.host.editMode).toBe(false);
});
it('preserves the existing behavior for responses without explicit revoked authority',async()=>{
 const t=setup(undefined);await t.save();expect(t.clearDraft).toHaveBeenCalledOnce();expect(t.host.editMode).toBe(false);
});
it('keeps existing error handling for a mutation error',async()=>{
 const t=setup(true);t.mutate.mockResolvedValueOnce({data:{workItemUpdate:{errors:['Cannot save'],workItem:null}}});await t.save();expect(t.clearDraft).not.toHaveBeenCalled();expect(t.host.editMode).toBe(true);expect(t.host.updateError).toBe('Cannot save');expect(t.capture).toHaveBeenCalledOnce();expect(t.host.updateInProgress).toBe(false);
});
it('keeps a draft after transport failure',async()=>{
 const t=setup(true);t.mutate.mockRejectedValueOnce(new Error('Offline'));await t.save();expect(t.clearDraft).not.toHaveBeenCalled();expect(t.host.editMode).toBe(true);expect(t.capture).toHaveBeenCalledOnce();expect(t.host.updateInProgress).toBe(false);
});
it('refuses missing, repeated or already patched source boundaries',()=>{
 for(const value of ['export default {};',source+source,prepareGitLabSaveAuthority(source)])expect(()=>prepareGitLabSaveAuthority(value)).toThrow('Inspect the pinned description Save acknowledgement boundary.');
});

interface DescriptionHost {
 initialDescriptionText:string;descriptionText:string;conflictedDescription:string;
 workItemDescription:{description:string};$refs:{markdownEditor?:{isContentEditorActive:boolean}};
 $emit:(name:string,value:unknown)=>void;clearDraftWorkItem:()=>void;
}
function childSetup(prepared=true,draft='Pending local draft.'){
 const original=readFileSync(new URL('../integrations/gitlab/fixtures/work-item-description-prepared.vue',import.meta.url),'utf8');
 const code=prepared?prepareGitLabSaveBaseline(original):original;
 const start=code.indexOf('    proceedWithUpdate() {'),end=code.indexOf('    setDescriptionText(',start);
 const check=code.indexOf('    checkForConflicts() {'),checkEnd=code.indexOf('    updateDraftDescription(',check);
 const methods:{proceedWithUpdate:(this:DescriptionHost)=>void;checkForConflicts:(this:DescriptionHost)=>void}=runInNewContext('({'+code.slice(check,checkEnd)+code.slice(start,end)+'})',{trackSavedUsingEditor:vi.fn()});
 const host:DescriptionHost={initialDescriptionText:'Server text.',descriptionText:draft,conflictedDescription:'',workItemDescription:{description:'Server text.'},$refs:{},$emit:vi.fn(),clearDraftWorkItem:vi.fn()};
 return {host,submit:()=>methods.proceedWithUpdate.call(host),refresh:()=>methods.checkForConflicts.call(host)};
}
it('reproduces the original child mistaking unchanged server text for a remote edit after submit',()=>{
 const t=childSetup(false);t.submit();t.refresh();expect(t.host.conflictedDescription).toBe('Server text.');
});
it.each(['Pending local draft.',''])('keeps the original server baseline until source %j is acknowledged',draft=>{
 const t=childSetup(true,draft);t.submit();t.refresh();expect(t.host.initialDescriptionText).toBe('Server text.');expect(t.host.descriptionText).toBe(draft);expect(t.host.conflictedDescription).toBe('');
});
it('still detects a genuine remote change after submitting a retained draft',()=>{
 const t=childSetup();t.submit();t.host.workItemDescription.description='Another writer changed the server.';t.refresh();expect(t.host.conflictedDescription).toBe('Another writer changed the server.');expect(t.host.descriptionText).toBe('Pending local draft.');
});
