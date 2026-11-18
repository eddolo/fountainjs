import json,statistics,sys
def median(a): return round(statistics.median(a),2)
for path in sys.argv[1:]:
 r=json.load(open(path,encoding='utf-8')); print(path)
 for c in r['cases']:
  print(c['engine'],c['size'],c['index'], [(t['mode'],median([s['applyMs'] for s in t['samples'][3:]]),median([s['viewSubscriberMs'] for s in t['samples'][3:]]) if 'viewSubscriberMs' in t['samples'][0] else None) for t in c['trials']])
