#!/usr/bin/env python3
"""ML smoke (TOR 4.13): upload a training Data Set → profile → prepare (outliers, scaling, derive) →
train with grid search → evaluation report → publish gate → Model Call rule → predictions.
Run after neb-prescreen-demo.py. Uses its own throw-away names (prefix ml-smoke)."""
import base64, csv, io, json, os, random, sys, time, urllib.request, urllib.error
B = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://localhost:4000'
T = None
def call(m, p, b=None, h=None, raw=False):
    hh = {'Content-Type': 'application/json', **(h or {})}
    if T: hh['Authorization'] = 'Bearer ' + T
    rq = urllib.request.Request(B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers=hh)
    try:
        with urllib.request.urlopen(rq, timeout=300) as r:
            body = r.read(); return r.status, (body.decode() if raw else json.loads(body or b'null'))
    except urllib.error.HTTPError as e:
        body = e.read(); return e.code, (body.decode() if raw else json.loads(body or b'null'))
fails = 0
def check(name, cond, got=None):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name, '' if cond else str(got)[:400]); fails += 0 if cond else 1
T = call('POST', '/auth/login', {'email': os.environ.get('XR_EMAIL', 'admin@example.com'), 'password': os.environ.get('XR_PASSWORD', 'admin123')})[1]['data']['access_token']
PID = 'neb-pre-screening'

# training data: past budget requests — was the request judged aligned with the strategy?
random.seed(7); rows = []
for i in range(400):
    amt = random.uniform(1e4, 5e6); qty = random.randint(1, 50); strat = random.choice(['S1', 'S2', 'S3']); prior = round(random.uniform(0, 1), 3)
    aligned = 'yes' if (strat != 'S3' and prior > 0.3) or amt < 2e5 else 'no'
    rows.append({'requestNo': f'R{i:04d}', 'amount': round(amt, 2), 'qty': qty, 'strategy': strat, 'priorRate': prior, 'aligned': aligned})
rows[7]['amount'] = 9e8   # an outlier the profile must find
buf = io.StringIO(); w = csv.DictWriter(buf, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
st, up = call('POST', '/data/datasets/upload', {'projectId': '_integration', 'name': 'ml-smoke requests', 'fileName': 'requests.csv',
              'contentBase64': base64.b64encode(buf.getvalue().encode()).decode(), 'keyFields': ['requestNo']})
check('upload CSV → Data Set', st == 200 and up['data']['rows'] == 400, (st, up))
DS = up['data']['id']

st, prof = call('POST', f'/data/datasets/{DS}/profile', {'target': 'aligned'})
amount = next((c for c in prof.get('data', {}).get('columns', []) if c['name'] == 'amount'), {})
check('profile finds the outlier (4.13.1.1)', st == 200 and amount.get('outliers', 0) >= 1, (st, amount))
check('profile ranks features for the target (4.13.1.2)', st == 200 and prof['data']['relevance'] and prof['data']['relevance'][0]['feature'] in ('priorRate', 'amount'), prof.get('data', {}).get('relevance'))

steps = [{'op': 'outliers', 'columns': ['amount'], 'method': 'iqr', 'action': 'remove'},
         {'op': 'derive', 'name': 'perUnit', 'expr': 'amount / qty'},
         {'op': 'minmax', 'columns': ['priorRate']}, {'op': 'center', 'columns': ['qty']}]
st, prev = call('POST', f'/data/datasets/{DS}/prepare', {'steps': steps, 'preview': True})
check('prepare preview (4.13.1.1/4.13.1.3)', st == 200 and prev['data']['total'] == 399 and 'perUnit' in prev['data']['columns'], (st, prev))
st, app = call('POST', f'/data/datasets/{DS}/prepare', {'steps': steps})
check('prepare applied as new snapshot', st == 200 and app['data']['rows'] == 399, (st, app))

models = call('GET', f'/models?project_id={PID}')[1]['data']
models = models.get('items', models) if isinstance(models, dict) else models
m = next((x for x in models if x['slug'] == 'ml-smoke-alignment'), None)
if not m:
    st, mm = call('POST', '/models', {'project_id': PID, 'projectId': PID, 'name': 'ml-smoke alignment', 'type': 'ML'}); m = mm.get('data'); check('model created', st in (200, 201), (st, mm))
MID = m['id']
st, gate = call('PUT', f'/models/{MID}/gate', {'metric': 'f1', 'min': 0.8})
check('evaluation gate set', st == 200, (st, gate))
st, v = call('POST', f'/models/{MID}/train', {'dataset': 'ml-smoke-requests', 'algorithm': 'random_forest', 'target': 'aligned',
             'features': ['amount', 'qty', 'strategy', 'priorRate', 'perUnit'], 'params': {'n_estimators': 120},
             'scaler': 'standard', 'search': {'type': 'grid', 'params': {'max_depth': [3, 6, 10]}, 'cv': 3}})
check('train queued (4.13.1.4/4.13.1.5/4.13.1.6)', st == 201 and v['data']['status'] == 'training', (st, v))
VID = v['data']['id']
for _ in range(120):
    vv = call('GET', f'/models/versions/{VID}')[1]['data']
    if vv['status'] != 'training': break
    time.sleep(1)
check('training finished', vv['status'] == 'ready', vv.get('error'))
rep = vv.get('report') or {}
check('evaluation metrics (4.13.1.7)', all(k in rep.get('metrics', {}) for k in ('accuracy', 'precision', 'recall', 'f1')), rep.get('metrics'))
check('grid search picked parameters', rep.get('search', {}).get('best', {}).get('max_depth') in (3, 6, 10), rep.get('search'))
check('confusion matrix + importance', rep.get('confusion') and rep.get('importance'), list(rep))
st, html = call('GET', f'/models/versions/{VID}/report.html', raw=True)
check('evaluation report document', st == 200 and 'Confusion matrix' in html and 'Metrics' in html, st)

st, pub = call('POST', f'/models/versions/{VID}/publish')
check('publish passes the gate', st == 200 and pub['data']['status'] == 'published', (st, pub))
call('PUT', f'/models/{MID}/gate', {'metric': 'f1', 'min': 1.01})
st, v2 = call('POST', f'/models/{MID}/train', {'dataset': 'ml-smoke-requests', 'algorithm': 'decision_tree', 'target': 'aligned', 'features': ['qty'], 'params': {'max_depth': 1}})
for _ in range(120):
    vv2 = call('GET', f'/models/versions/{v2["data"]["id"]}')[1]['data']
    if vv2['status'] != 'training': break
    time.sleep(1)
st, bad = call('POST', f'/models/versions/{v2["data"]["id"]}/publish')
check('publish blocked below the gate', st == 400 and 'gate' in json.dumps(bad), (st, bad))
call('PUT', f'/models/{MID}/gate', {'metric': 'f1', 'min': 0.8})

# Model Call rule — the published model inside the decision layer (4.13.3 via REST later)
rules = call('GET', f'/rules?project_id={PID}')[1]['data']
r = next((x for x in rules if x['slug'] == 'ml-smoke-alignment-check'), None)
if not r:
    st, rr = call('POST', '/rules', {'project_id': PID, 'name': 'ml-smoke alignment check', 'type': 'MODEL_CALL',
               'definition': {'model': 'ml-smoke-alignment', 'forEach': 'items', 'fields': ['amount', 'qty', 'strategy', 'priorRate', 'perUnit']}})
    r = rr.get('data'); check('Model Call rule created', st in (200, 201), (st, rr))
item = {'amount': 1200000, 'qty': 4, 'strategy': 'S1', 'priorRate': 0.8, 'perUnit': 300000}
st, ex = call('POST', '/execute', {'rule_id': r['id'], 'ruleId': r['id'], 'input': {'items': [item, {**item, 'strategy': 'S3', 'priorRate': 0.1}]}})
out = (ex.get('data') or {}).get('output') or (ex.get('data') or {}).get('result') or ex.get('data')
res = (out or {}).get('results') if isinstance(out, dict) else None
check('Model Call predicts per item', st == 200 and res and len(res) == 2 and 'prediction' in res[0] and 'probability' in res[0], (st, ex))
print('FAILED' if fails else 'ALL PASS', fails)
sys.exit(1 if fails else 0)
