import {expect,it} from 'vitest';
// @ts-expect-error Private audit helper has no published declaration.
import {waitForGitLabDeployment} from '../scripts/gitlab-deployment-readiness.mjs';
function clock(){let time=0;const delays:number[]=[];return {now:()=>time,wait:async(ms:number)=>{delays.push(ms);time+=ms;},delays};}
it('waits for healthy running state and the actual HTTP readiness probe',async()=>{
 const c=clock(),states=[{Running:true,Status:'running',Health:{Status:'starting'}},{Running:true,Status:'running',Health:{Status:'healthy'}}];let probes=0;
 const result=await waitForGitLabDeployment({...c,readState:()=>states.shift()??{Running:true,Status:'running',Health:{Status:'healthy'}},probe:async()=>++probes===1?503:200});
 expect(result.attempts).toBe(3);expect(probes).toBe(2);expect(c.delays).toEqual([1000,2000]);
});
it('fails a confirmed exit immediately, preserves its observation and never probes or restarts it',async()=>{
 const c=clock(),observed:unknown[]=[];let probes=0;
 await expect(waitForGitLabDeployment({...c,readState:()=>({Running:false,Status:'exited',ExitCode:1}),probe:()=>{probes++;return 200;},observe:(value:unknown)=>observed.push(value)})).rejects.toThrow('exited before readiness');
 expect(probes).toBe(0);expect(c.delays).toEqual([]);expect(observed).toEqual([{attempt:1,running:false,status:'exited',health:undefined,exitCode:1}]);
});
it('retains the deadline when the service stays alive but HTTP probes fail',async()=>{
 const c=clock();
 await expect(waitForGitLabDeployment({...c,timeoutMs:3500,readState:()=>({Running:true,Status:'running',Health:{Status:'healthy'}}),probe:()=>{throw new Error('Transport unavailable');}})).rejects.toThrow('startup deadline');
 expect(c.delays).toEqual([1000,2000,500]);
});
