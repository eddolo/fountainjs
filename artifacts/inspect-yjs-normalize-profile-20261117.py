import json,bisect
from collections import defaultdict
from pathlib import Path
root=Path(__file__).resolve().parent.parent
profile=json.loads((root/'artifacts/yjs-normalize-baseline-20261117.cpuprofile').read_text())
package=root/'artifacts/yjs-normalize-baseline-20261117/node_modules/fountainjs-editor/dist'
alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
def vlq(segment):
 result=[];value=shift=0
 for char in segment:
  digit=alphabet.index(char);value|=(digit&31)<<shift
  if digit&32:shift+=5
  else:result.append(-(value>>1) if value&1 else value>>1);value=shift=0
 return result
maps={}
def original(frame):
 name=frame['url'].rsplit('/',1)[-1];path=package/(name+'.map')
 if '/fountainjs-editor/dist/' not in frame['url'] or not path.exists():return frame['url'],frame['lineNumber']+1
 if name not in maps:
  data=json.loads(path.read_text());lines=[];source=line=column=0
  for generated in data['mappings'].split(';'):
   at=0;entries=[]
   for segment in generated.split(','):
    if not segment:continue
    delta=vlq(segment);at+=delta[0]
    if len(delta)>1:source+=delta[1];line+=delta[2];column+=delta[3];entries.append((at,data['sources'][source],line+1))
    else:entries.append((at,None,None))
   lines.append(entries)
  maps[name]=lines
 if frame['lineNumber']<0 or frame['lineNumber']>=len(maps[name]):return frame['url'],frame['lineNumber']+1
 rows=maps[name][frame['lineNumber']];index=bisect.bisect_right([v[0] for v in rows],frame['columnNumber'])-1
 return (rows[index][1],rows[index][2]) if index>=0 else (frame['url'],frame['lineNumber']+1)
nodes={node['id']:node for node in profile['nodes']};parents={child:node['id'] for node in nodes.values() for child in node.get('children',[])}
roots={node['id'] for node in nodes.values() if 'diagnose-yjs-endurance.mjs' in node['callFrame']['url'] and node['callFrame']['lineNumber']==208}
def typing(node):
 while node in parents:
  if node in roots:return True
  node=parents[node]
 return False
self_ms=defaultdict(float);inclusive=defaultdict(float);total=0
for node,delta in zip(profile['samples'],profile['timeDeltas']):
 if not typing(node):continue
 ms=delta/1000;total+=ms;frame=nodes[node]['callFrame'];path,line=original(frame);self_ms[(frame['functionName'],path,line)]+=ms
 seen=set();at=node
 while at in parents:
  frame=nodes[at]['callFrame'];path,line=original(frame);key=(frame['functionName'],path,line)
  if key not in seen:inclusive[key]+=ms;seen.add(key)
  at=parents[at]
def rows(values):return [dict(name=key[0],source=key[1],line=key[2],sampledMs=round(ms,2)) for key,ms in sorted(values.items(),key=lambda item:item[1],reverse=True)]
result={'scope':'Function samples below exact typing callback; does not attribute root-level GC samples. Not unprofiled latency.','typingSampledMs':round(total,2),'self':rows(self_ms),'inclusive':rows(inclusive)}
(root/'artifacts/yjs-normalize-baseline-attribution-20261117.json').write_text(json.dumps(result,indent=2)+'\n')
for kind in ['self','inclusive']:
 print(kind)
 for row in result[kind][:18]:print(row)
