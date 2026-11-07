import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
const report=JSON.parse(await readFile('artifacts/retained-repair-browser-20261107.json','utf8'));assert.equal(report.stats.expected,12);for(const key of ['unexpected','flaky','skipped'])assert.equal(report.stats[key],0);
const journeys=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test})}}visit(report.suites);
const folder='artifacts/retained-repair-visual-20261107';await mkdir(folder,{recursive:true});const sources=[];
for(const journey of journeys){
 const kind=journey.name.startsWith('shares a duplicate')?'duplicate':journey.name.startsWith('shares an automatic')?'trailing':journey.name.startsWith('repairs duplicate')?'offline':'local',video=journey.results[0].attachments.find(a=>a.name==='video').path,target=join(folder,journey.projectName+'-'+kind);
 await copyFile(video,target+'.webm');for(const stage of kind==='duplicate'?['repaired','final']:kind==='trailing'?['divider-repaired','final']:['final'])await copyFile(join(dirname(video),stage+'.png'),target+'-'+stage+'.png');
 const duration=Number(execFileSync('C:/ProgramData/chocolatey/bin/ffprobe.exe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',target+'.webm'],{encoding:'utf8'}).trim());assert(duration>0);
 execFileSync('C:/ProgramData/chocolatey/bin/ffmpeg.exe',['-v','error','-y','-i',target+'.webm','-vf',`fps=${6/duration},scale=480:-1,tile=3x2`,'-frames:v','1',target+'-filmstrip.png'],{stdio:'pipe'});sources.push({engine:journey.projectName,name:journey.name,kind,video,durationSeconds:duration,target});
}
await writeFile('artifacts/retained-repair-visual-sources-20261107.json',JSON.stringify(sources,null,2)+'\n');console.log(JSON.stringify({recordings:12,stageImages:18,filmstrips:12}));
