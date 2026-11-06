import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
const prefix='artifacts/retained-model-reuse',report=JSON.parse(await readFile(prefix+'-browser-20261106.json','utf8'));
assert.equal(report.stats.expected,99);assert.equal(report.stats.unexpected,0);
const journeys=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test});}}visit(report.suites);
const folder=prefix+'-visual-20261106';await mkdir(folder,{recursive:true});const sources=[];
for(const engine of ['chromium','firefox','webkit']){
 const large=journeys.find(test=>test.projectName===engine&&test.name==='edits a thousand-paragraph shared document with native input and independent author history');
 const replacement=journeys.find(test=>test.projectName===engine&&test.name==='replaces marked text and deletes natively while preserving peer edits through keyboard history');
 const video=large.results[0].attachments.find(attachment=>attachment.name==='video').path;
 const replacementVideo=replacement.results[0].attachments.find(attachment=>attachment.name==='video').path;
 const output=join(folder,engine+'-large-workflow.webm');await copyFile(video,output);
 await copyFile(join(dirname(video),'bulk-document-middle.png'),join(folder,engine+'-middle.png'));
 await copyFile(join(dirname(replacementVideo),'native-replacement-history.png'),join(folder,engine+'-replacement.png'));
 const duration=Number(execFileSync('C:/ProgramData/chocolatey/bin/ffprobe.exe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',output],{encoding:'utf8'}).trim());assert(duration>0);
 execFileSync('C:/ProgramData/chocolatey/bin/ffmpeg.exe',['-v','error','-y','-i',output,'-vf',`fps=${6/duration},scale=480:-1,tile=3x2`,'-frames:v','1',join(folder,engine+'-large-filmstrip.png')],{stdio:'pipe'});
 const replacementOutput=join(folder,engine+'-replacement-workflow.webm');await copyFile(replacementVideo,replacementOutput);
 const replacementDuration=Number(execFileSync('C:/ProgramData/chocolatey/bin/ffprobe.exe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',replacementOutput],{encoding:'utf8'}).trim());assert(replacementDuration>0);
 execFileSync('C:/ProgramData/chocolatey/bin/ffmpeg.exe',['-v','error','-y','-i',replacementOutput,'-vf',`fps=${6/replacementDuration},scale=480:-1,tile=3x2`,'-frames:v','1',join(folder,engine+'-replacement-filmstrip.png')],{stdio:'pipe'});
 sources.push({engine,video,replacementVideo,durationSeconds:duration,replacementDurationSeconds:replacementDuration});
}
await writeFile(prefix+'-visual-sources-20261106.json',JSON.stringify(sources,null,2)+'\n');console.log(JSON.stringify(sources));
