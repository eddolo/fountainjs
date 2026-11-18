from pathlib import Path
from statistics import median
from hashlib import sha256
import json
runs = ['factory-control-a', 'factory-candidate-a', 'factory-candidate-b', 'factory-control-b']
reports = [json.loads((Path(run)/'report.json').read_text()) for run in runs]
results = {}
contexts = updates = 0
for report in reports:
    assert report['errors'] == [] and len(report['cases']) == 4
for i, ref in enumerate(reports[0]['cases']):
    key = f"{ref['engine']}-{ref['size']}-{ref['index']}"
    binary = (Path('parent-a/captures')/(key+'.bin')).read_bytes()
    assert sha256(binary).hexdigest() == ref['seedHash']
    raw = json.loads((Path('parent-a/captures')/(key+'.json')).read_text())
    compact = lambda x: json.dumps(x,separators=(',',':'),ensure_ascii=False).encode()
    assert sha256(compact(raw['updates'])).hexdigest() == ref['wireHash']
    assert sha256(compact(raw['json'])).hexdigest() == ref['jsonHash']
    output = {}
    for name, report in zip(runs,reports):
        c=report['cases'][i]
        assert all(c[k] == ref[k] for k in ['engine','index','size','seedHash','wireHash','wireBytes','jsonHash'])
        modes={}
        for trial in c['trials']:
            assert len(trial['samples']) == 24
            contexts += 1
            updates += len(trial['samples'])
            modes.setdefault(trial['mode'],[]).extend(s['applyMs'] for s in trial['samples'][report['warmupPerTrial']:])
        output[name]={m:round(median(samples),2) for m,samples in modes.items()}
    results[key]=output
print(json.dumps(dict(contexts=contexts,updates=updates,medianApplyMs=results),indent=2))
