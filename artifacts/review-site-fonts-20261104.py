from pathlib import Path
import json, subprocess
from PIL import Image, ImageDraw
out=Path('artifacts/site-font-visual-review-20261104');out.mkdir(exist_ok=True)
records=[]
for rootname in ['site-font-verified-production-browser-20261104','site-font-verified-startup-browser-20261104']:
 root=Path('artifacts')/rootname
 for folder in sorted(p for p in root.iterdir() if p.is_dir()):
  pictures=sorted(folder.rglob('*.png'));tiles=[]
  for p in pictures:
   picture=Image.open(p).convert('RGB')
   if 'mobile' in p.name and picture.width>500:picture=picture.resize((390,round(picture.height*390/picture.width)))
   for start in range(0,picture.height,1100) if picture.width<500 else [0]:
    crop=picture.crop((0,start,picture.width,min(start+1100,picture.height))) if picture.width<500 else picture.copy();crop.thumbnail((800,1300))
    tile=Image.new('RGB',(820,crop.height+35),'#eee');tile.paste(crop,((820-crop.width)//2,30));ImageDraw.Draw(tile).text((10,7),p.name+f' y={start}',fill='black');tiles.append(tile)
  rows=[tiles[i:i+2] for i in range(0,len(tiles),2)];sheet=Image.new('RGB',(1640,sum(max(t.height for t in row) for row in rows)),'white');y=0
  for row in rows:
   for i,t in enumerate(row):sheet.paste(t,(i*820,y))
   y+=max(t.height for t in row)
  contact=out/(folder.name+'.png');sheet.save(contact)
  video=folder/'video.webm';duration=float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(video)],text=True))['format']['duration'])
  recording=Image.new('RGB',(1640,1455),'#eee')
  for i,fraction in enumerate([.15,.30,.45,.60,.75,.90]):
   target=out/(folder.name+f'-frame-{i}.png');subprocess.run(['ffmpeg','-v','error','-threads','1','-ss',str(duration*fraction),'-i',str(video),'-frames:v','1','-threads','1','-y',str(target)],check=True)
   frame=Image.open(target).convert('RGB');frame.thumbnail((800,450));x,y=i%2*820,i//2*485;recording.paste(frame,(x+10,y+25));ImageDraw.Draw(recording).text((x+10,y+6),f'{duration*fraction:.2f}s',fill='black')
  recording_path=out/(folder.name+'-recording.png');recording.save(recording_path)
  records.append({'folder':folder.as_posix(),'pictures':[p.as_posix() for p in pictures],'contact':contact.as_posix(),'video':video.as_posix(),'durationSeconds':duration,'recordingContact':recording_path.as_posix()})
(out/'index.json').write_bytes(json.dumps(records,indent=2).encode()+b'\n')
print(len(records),'recordings;',sum(len(r['pictures']) for r in records),'captures')
