#!/usr/bin/env python3
"""Smoke test for the API gateway (run after scripts/neb-prescreen-demo.py)."""
import json, sys, urllib.request, urllib.error
B = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://localhost:4000'
T = None
def call(m, p, b=None, h=None):
    hh = {'Content-Type': 'application/json', **(h or {})}
    if T and 'X-API-Key' not in hh: hh['Authorization'] = 'Bearer ' + T
    rq = urllib.request.Request(B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers=hh)
    try:
        with urllib.request.urlopen(rq, timeout=60) as r: return r.status, json.loads(r.read() or b'null'), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null'), dict(e.headers)
T = call('POST', '/auth/login', {'email': 'admin@example.com', 'password': 'admin123'})[1]['data']['access_token']
projects = call('GET', '/projects')[1]['data']; projects = projects.get('items', projects) if isinstance(projects, dict) else projects
PID = next(p['id'] for p in projects if p['slug'] == 'neb-pre-screening')
spec = next(x for x in call('GET', f'/platform/specs?project_id={PID}')[1]['data'] if x['basePath'] == 'neb-prescreen')
key = call('POST', '/api-keys', {'name': 'smoke', 'specIds': [spec['id']], 'rateLimitPerMin': 50, 'systemName': 'smoke'})[1]['data']['key']
K = {'X-API-Key': key}
body = {'context': {'fiscalYear': 2571, 'agencyCode': '03007', 'areaCode': '10'},
        'items': [{'lineId': 'L-001', 'budgetType': 'ครุภัณฑ์', 'itemCode': 'DAS-1203-0045', 'qty': 4, 'unitPrice': 28500, 'amount': 114000}]}
fails = 0
def check(name, cond, got):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name, '' if cond else got); fails += 0 if cond else 1
st, o, hd = call('POST', '/api/neb-prescreen/v1/prescreen', body, K)
check('prescreen 200 with WARNING 4.4.1.3', st == 200 and any(f['ruleCode'] == 'TOR-4.4.1.3' for f in o.get('findings', [])), (st, o))
st, o, _ = call('GET', '/api/neb-prescreen/v1/standard-price/DAS-1203-0045?fiscalYear=2571', None, K)
check('lookup returns 24000', st == 200 and (o.get('price') or {}).get('unitPrice') == 24000, (st, o))
check('schema 400', call('POST', '/api/neb-prescreen/v1/prescreen', {'x': 1}, K)[0] == 400, None)
check('no key 401', call('POST', '/api/neb-prescreen/v1/prescreen', body)[0] == 401, None)
check('wrong method 405', call('GET', '/api/neb-prescreen/v1/prescreen', None, K)[0] == 405, None)
h2 = {**K, 'Idempotency-Key': 'abc-1'}
a = call('POST', '/api/neb-prescreen/v1/prescreen', body, h2); b = call('POST', '/api/neb-prescreen/v1/prescreen', body, h2)
check('idempotent replay', b[2].get('Idempotent-Replay') == 'true' and a[1] == b[1], b[2])
ex = hd.get('X-Execution-Id')
tr = call('GET', f'/platform/executions/{ex}/trace')[1]['data']
kinds = [t['kind'] for t in tr['trace']] if isinstance(tr['trace'], list) else []
sub = next((t for t in tr['trace'] if t.get('children')), None) if isinstance(tr['trace'], list) else None
check('trace has subflow with rule steps', sub is not None and any(c['kind'] == 'rulecall' for c in sub['children']), (ex, str(tr)[:300]))
sys.exit(1 if fails else 0)
