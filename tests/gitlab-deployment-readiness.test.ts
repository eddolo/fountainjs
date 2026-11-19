import {expect,it} from 'vitest';
// @ts-expect-error Private audit helper has no published declaration.
import {loggerStartupFailure,waitForGitLabDeployment} from '../scripts/gitlab-deployment-readiness.mjs';
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
it('identifies only a matching failed logger restart on an exited container',()=>{
 const state={Status:'exited',Running:false,ExitCode:1,OOMKilled:false,Dead:false};
 const logs="FATAL: Mixlib::ShellOut::ShellCommandFailed: runit_service[gitaly] had an error: ruby_block[restart_log_service] failed\nSTDOUT: timeout: down: /opt/gitlab/service/gitaly/log: 0s, normally up, want up";
 expect(loggerStartupFailure(state,logs)).toBe('gitaly');
 const redis=logs.replaceAll('gitaly','redis').replace('runit_service[redis]',
   'redis_service[redis] (redis::enable line 19) had an error: Mixlib::ShellOut::ShellCommandFailed: runit_service[redis]');
 expect(loggerStartupFailure(state,redis)).toBe('redis');
 expect(loggerStartupFailure({...state,OOMKilled:true},logs)).toBeUndefined();
 expect(loggerStartupFailure(state,logs.replace('service/gitaly/log','service/redis/log'))).toBeUndefined();
 expect(loggerStartupFailure(state,logs+'\nFATAL: Mixlib::ShellOut::ShellCommandFailed: migrate database')).toBeUndefined();
});
it('records the failed boot, retries once, and still probes the new boot before success',async()=>{
 const c=clock(),exited={Running:false,Status:'exited',ExitCode:1};
 const healthy={Running:true,Status:'running',Health:{Status:'healthy'}};
 let states=[exited,healthy],retries=0,probes=0;
 const starts={...c,readState:()=>states.shift()??exited,probe:()=>{probes++;return 200;},retryLoggerExit:()=>{retries++;return true;}};
 expect(await waitForGitLabDeployment(starts)).toEqual({attempts:2});
 expect([retries,probes]).toEqual([1,1]);
 states=[exited,exited];retries=0;probes=0;
 await expect(waitForGitLabDeployment(starts)).rejects.toThrow('exited before readiness');
 expect([retries,probes]).toEqual([1,0]);
});
it('retains the deadline when the service stays alive but HTTP probes fail',async()=>{
 const c=clock();
 await expect(waitForGitLabDeployment({...c,timeoutMs:3500,readState:()=>({Running:true,Status:'running',Health:{Status:'healthy'}}),probe:()=>{throw new Error('Transport unavailable');}})).rejects.toThrow('startup deadline');
 expect(c.delays).toEqual([1000,2000,500]);
});
