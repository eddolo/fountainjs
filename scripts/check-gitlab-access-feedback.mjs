import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectGitLabAccessFeedback} from '../integrations/gitlab/testing/access-feedback.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),arg=flag=>process.argv[process.argv.indexOf(flag)+1];
if(!['--report','--output'].every(flag=>process.argv.includes(flag)))throw new Error('Pass --report report.json --output exclusive-directory');
const path=resolve(root,arg('--report')),output=resolve(root,arg('--output')),allowed=resolve(root,'artifacts/gitlab-compatibility');
for(const target of [path,output]){const part=relative(allowed,target);if(!part||isAbsolute(part)||part==='..'||part.startsWith('..'+sep))throw new Error('Use explicit task artifact paths.');}
const bytes=await readFile(path),report=JSON.parse(bytes),result=inspectGitLabAccessFeedback(report);
result.input={path:relative(root,path).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex')};
result.verifierSha256=createHash('sha256').update(await readFile(new URL('../integrations/gitlab/testing/access-feedback.mjs',import.meta.url))).digest('hex');
await mkdir(output);await writeFile(resolve(output,'report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
