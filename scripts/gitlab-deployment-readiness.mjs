/** Read-only startup gate; a confirmed terminal container is not a slow boot. */
export async function waitForGitLabDeployment({readState,probe,observe=()=>{},now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=300000}){
 const deadline=now()+timeoutMs,intervals=[1000,2000,5000];let attempts=0;
 for(;;){
  const state=await readState();attempts++;
  observe({attempt:attempts,running:state.Running===true,status:state.Status,health:state.Health?.Status,exitCode:state.ExitCode});
  if(state.Status==='exited'||state.Status==='dead'||state.Dead===true)throw new Error('The isolated GitLab deployment exited before readiness.');
  if(state.Running===true&&state.Health?.Status==='healthy'){
   try{if(await probe()===200)return {attempts};}catch{/* Transport failure remains unready. */}
  }
  const remaining=deadline-now();if(remaining<=0)throw new Error('The isolated GitLab deployment did not become ready within the startup deadline.');
  await wait(Math.min(intervals[Math.min(attempts-1,intervals.length-1)],remaining));
 }
}
