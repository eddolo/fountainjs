import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
const report=JSON.parse(await readFile('artifacts/retained-checkpoint-final-browser-20261106.json','utf8'));
assert.equal(report.stats.expected,108);assert.equal(report.stats.unexpected,0);assert.equal(report.stats.flaky,0);assert.equal(report.stats.skipped,0);
const journeys=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test})}}visit(report.suites);
const folder='artifacts/retained-checkpoint-visual-20261106';await mkdir(folder,{recursive:true});const sources=[];
for(const journey of journeys.filter(item=>item.name.startsWith('restores an isolated snapshot')||item.name.startsWith('rejects a concurrent source write')||item.name.startsWith('rejects damaged bytes'))){
 const kind=journey.name.includes('isolated snapshot')?'restore':journey.name.includes('concurrent')?'race':'damage';
 const video=journey.results[0].attachments.find(item=>item.name==='video').path,target=join(folder,journey.projectName+'-'+kind);
 await copyFile(video,target+'.webm');await copyFile(join(dirname(video),'final.png'),target+'-final.png');
 if(kind==='restore')await copyFile(join(dirname(video),'isolated.png'),target+'-isolated.png');
 const duration=Number(execFileSync('C:/ProgramData/chocolatey/bin/ffprobe.exe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',target+'.webm'],{encoding:'utf8'}).trim());assert(duration>0);
 execFileSync('C:/ProgramData/chocolatey/bin/ffmpeg.exe',['-v','error','-y','-i',target+'.webm','-vf',`fps=${6/duration},scale=480:-1,tile=3x2`,'-frames:v','1',target+'-filmstrip.png'],{stdio:'pipe'});
 sources.push({engine:journey.projectName,name:journey.name,kind,video,durationSeconds:duration,target});
}
assert.equal(sources.length,9);await writeFile('artifacts/retained-checkpoint-visual-sources-20261106.json',JSON.stringify(sources,null,2)+'\n');console.log(JSON.stringify({recordings:9,stageImages:12,filmstrips:9}));
