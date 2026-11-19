import {afterEach,expect,it,vi} from 'vitest';
// @ts-expect-error Private GitLab adapter has no published type declarations.
import {readReviewAccess,reviewBranchAccess} from '../integrations/gitlab/services/review_branch_access.js';

const mr=()=>({id:98,iid:7,target_project_full_path:'group/target'});
const identity=<T>(value:T)=>value;
const details={id:98,iid:7,source_project_id:42,source_branch:'review/fork'};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

it('shares the actual fork branch check, keeps a denial through transient errors and restores on a confirmed read',async()=>{
  const widget=mr();
  const read=vi.fn().mockResolvedValueOnce(details).mockResolvedValueOnce({name:'review/fork',can_push:false})
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({name:'unrelated',can_push:true})
    .mockResolvedValueOnce({name:'review/fork',can_push:true});
  const access=reviewBranchAccess(widget,identity,read);
  expect(reviewBranchAccess(widget,identity,read)).toBe(access);
  await Promise.all([access.refresh(),access.refresh()]);
  expect(read.mock.calls.map(([path])=>path)).toEqual(['/api/:version/projects/group%2Ftarget/merge_requests/7','/api/:version/projects/42/repository/branches/review%2Ffork']);
  expect(access.state.restricted).toBe(true);
  await access.refresh(); await access.refresh();
  expect(access.state.restricted).toBe(true);
  await access.refresh();
  expect(access.state).toMatchObject({restricted:false,checking:false});
});

it('reads current access for an unchanged branch and keeps a denial until an authorized read succeeds', async()=>{
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(details))
    .mockResolvedValueOnce(new Response(null,{status:403}))
    .mockResolvedValueOnce(new Response(null,{status:503}))
    .mockResolvedValueOnce(Response.json({name:details.source_branch,can_push:true}));
  vi.stubGlobal('fetch',fetcher);
  const access = reviewBranchAccess(mr(),identity,readReviewAccess);
  await access.refresh();
  expect(access.state.restricted).toBe(true);
  await access.recheck();
  expect(access.state.restricted).toBe(true);
  await access.recheck();
  expect(access.state.restricted).toBe(false);
  for (const [url,options] of fetcher.mock.calls.slice(1)) {
    expect(url).toBe('/api/:version/projects/42/repository/branches/review%2Ffork');
    expect(options).toMatchObject({cache:'no-store',mode:'same-origin',credentials:'same-origin'});
  }
});

it('starts a fresh manual check when an earlier check is still reading the former role',async()=>{
  let finish:(value:unknown)=>void=()=>{};
  const delayed=new Promise(resolve=>{finish=resolve;});
  const read=vi.fn().mockResolvedValueOnce(details).mockReturnValueOnce(delayed)
    .mockResolvedValueOnce({name:'review/fork',can_push:true});
  const access=reviewBranchAccess(mr(),identity,read);
  const older=access.refresh();
  await Promise.resolve();
  const current=access.recheck();
  expect(access.recheck()).toBe(current);
  finish({name:'review/fork',can_push:false});
  await Promise.all([older,current]);
  expect(read).toHaveBeenCalledTimes(3);
  expect(access.state).toEqual({restricted:false,checking:false});
});

it('stops reading when the confirmation closes, its page is hidden, or GitLab detaches the widget',async()=>{
  vi.useFakeTimers();
  const visibility={hidden:false};
  vi.stubGlobal('document',visibility);
  const read=vi.fn().mockResolvedValueOnce(details).mockResolvedValue({name:'review/fork',can_push:true});
  const access=reviewBranchAccess(mr(),identity,read);
  let connected=true;
  const stop=access.watch(()=>connected);
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  visibility.hidden=true;
  await vi.advanceTimersByTimeAsync(4000);
  expect(read).toHaveBeenCalledTimes(2);
  visibility.hidden=false;
  await vi.advanceTimersByTimeAsync(2000);
  expect(read).toHaveBeenCalledTimes(3);
  connected=false;
  await vi.advanceTimersByTimeAsync(4000);
  expect(vi.getTimerCount()).toBe(0);
  stop(); connected=true;
  const close=access.watch(()=>connected);
  close();
  await vi.advanceTimersByTimeAsync(20000);
  expect(read).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
});
