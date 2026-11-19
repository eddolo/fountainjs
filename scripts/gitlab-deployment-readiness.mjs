// Only a failed Omnibus logger restart from this boot is eligible for a cold-start retry.
export function loggerStartupFailure(state, logs) {
 if (state.Status!=='exited' || state.Running!==false || state.ExitCode!==1 || state.OOMKilled || state.Dead) return;
 const failures = logs.split('\n').filter(line=>line.includes('FATAL: Mixlib::'));
 const match = failures.at(-1)?.match(/FATAL: Mixlib::ShellOut::ShellCommandFailed: (?:redis_service\[redis\] \([^)]*\) had an error: Mixlib::ShellOut::ShellCommandFailed: )?runit_service\[([a-z0-9_-]+)\].*ruby_block\[(restart_log_service|reload_log_service)\]/u);
 if (!match) return;
 const [,service,action] = match;
 if (action==='restart_log_service' && logs.includes('STDOUT: timeout: down: /opt/gitlab/service/'+service+'/log:')) return service;
 if (action==='reload_log_service' && logs.includes('STDOUT: kill: down: /opt/gitlab/service/'+service+'/log: 0s, normally up, want up')) return service;
}

export async function waitForGitLabDeployment({readState,probe,retryLoggerExit,observe=()=>{},now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=300000}){
 const deadline=now()+timeoutMs,intervals=[1000,2000,5000];let attempts=0,retried=false;
 for(;;){
  const state=await readState();attempts++;
  observe({attempt:attempts,running:state.Running===true,status:state.Status,health:state.Health?.Status,exitCode:state.ExitCode});
  if(state.Status==='exited'||state.Status==='dead'||state.Dead===true){
   if (!retried && retryLoggerExit && state.Status==='exited' && state.Running===false && state.ExitCode===1 &&
       !state.OOMKilled && !state.Dead && now()<deadline && await retryLoggerExit(state)) { retried=true; continue; }
   throw new Error('The isolated GitLab deployment exited before readiness.');
  }
  if(state.Running===true&&state.Health?.Status==='healthy'){
   try{if(await probe()===200)return {attempts};}catch{/* Transport failure remains unready. */}
  }
  const remaining=deadline-now();if(remaining<=0)throw new Error('The isolated GitLab deployment did not become ready within the startup deadline.');
  await wait(Math.min(intervals[Math.min(attempts-1,intervals.length-1)],remaining));
 }
}
