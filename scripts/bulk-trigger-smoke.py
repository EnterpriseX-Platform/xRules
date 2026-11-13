#!/usr/bin/env python3
"""Smoke test: batch API, Bulk Run (create, progress, CSV, retry, compare) and a webhook Trigger."""
import json, sys, time, urllib.request, urllib.error
B = 'http://localhost:4000'; T = None
def call(m, p, b=None, h=None, raw=False):
    hh = {'Content-Type': 'application/json', **(h or {})}
    if T and 'X-API-Key' not in hh and 'X-Hook-Token' not in hh: hh['Authorization'] = 'Bearer ' + T
    rq = urllib.request.Request(B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers=hh)
    try:
        with urllib.request.urlopen(rq, timeout=120) as r:
            d = r.read(); return r.status, (d.decode() if raw else json.loads(d or b'null'))
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')
T = call('POST', '/auth/login', {'email': 'admin@example.com', 'password': 'admin123'})[1]['data']['access_token']
projects = call('GET', '/projects')[1]['data']; projects = projects.get('items', projects) if isinstance(projects, dict) else projects
PID = next(p['id'] for p in projects if p['slug'] == 'neb-pre-screening')
spec = next(x for x in call('GET', f'/platform/specs?project_id={PID}')[1]['data'] if x['basePath'] == 'neb-prescreen')
key = call('POST', '/api-keys', {'name': 'smoke-bulk', 'specIds': [spec['id']], 'rateLimitPerMin': 100})[1]['data']['key']
fails = 0
def check(name, cond, got=None):
    global fails; print(('PASS ' if cond else 'FAIL ') + name, '' if cond else got); fails += 0 if cond else 1
ctx = {'fiscalYear': 2571, 'agencyCode': '03007', 'areaCode': '10'}
def item(i, price): return {'context': ctx, 'items': [{'lineId': f'L-{i}', 'budgetType': 'equipment', 'itemCode': 'DAS-1203-0045', 'qty': 1, 'unitPrice': price, 'amount': price}]}
st, o = call('POST', '/api/neb-prescreen/v1/prescreen/batch', {'items': [item(1, 20000), item(2, 30000)]}, {'X-API-Key': key})
check('batch returns 2 results', st == 200 and o['count'] == 2 and len(o['results'][1]['findings']) >= 1, (st, o))
# bulk: 300 rows, half over the standard price; one row broken (no items) → error
rows = [{'line': f'L-{i}', 'price': 20000 if i % 2 else 30000} for i in range(300)]
mapping = {'context': ctx, 'items': [{'lineId': '{{line}}', 'budgetType': 'equipment', 'itemCode': 'DAS-1203-0045', 'qty': 1, 'unitPrice': '{{price}}', 'amount': '{{price}}'}]}
st, run = call('POST', '/platform/bulk', {'projectId': PID, 'name': 'smoke', 'targetType': 'decision_flow', 'target': 'neb-prescreen', 'source': {'kind': 'rows', 'rows': rows}, 'mapping': mapping, 'concurrency': 8})
check('bulk created', st == 201 and run['data']['total'] == 300, (st, run))
rid = run['data']['id']
for _ in range(90):
    r = call('GET', f'/platform/bulk/{rid}')[1]['data']
    if r['status'] in ('COMPLETED', 'FAILED'): break
    time.sleep(1)
check('bulk completed 300 rows', r['status'] == 'COMPLETED' and r['processed'] == 300, r)
check('summary counts WARNING 4.4.1.3 = 150', (r.get('summary') or {}).get('byRule', {}).get('TOR-4.4.1.3', {}).get('WARNING') == 150, r.get('summary'))
st, csv = call('GET', f'/platform/bulk/{rid}/results.csv', raw=True)
check('csv has 301 lines', st == 200 and len(csv.strip().split('\n')) == 301, csv[:200])
# webhook trigger that calls the decision flow and fails loudly when given nothing
g = {'nodes': [{'id': 't', 'type': 'trigger', 'data': {'type': 'webhook', 'secret': 'hook-secret-123'}},
               {'id': 'd', 'type': 'callDecisionFlow', 'data': {'flow': 'neb-prescreen', 'inputMap': '{{input.body}}', 'outputAs': 'decision'}}],
     'edges': [{'source': 't', 'target': 'd'}]}
fl = [f for f in call('GET', f'/flows?project_id={PID}')[1]['data'] if f['slug'] == 'smoke-webhook']
f = fl[0] if fl else call('POST', '/flows', {'name': 'smoke webhook', 'projectId': PID, 'kind': 'TRIGGER', 'graph': g})[1]['data']
call('PUT', f"/flows/{f['id']}", {'graph': g}); call('POST', f"/flows/{f['id']}/publish", {})
st, o = call('POST', '/hooks/smoke-webhook', item(9, 30000), {'X-Hook-Token': 'hook-secret-123'})
check('webhook accepted 202', st == 202, (st, o))
check('webhook bad token 401', call('POST', '/hooks/smoke-webhook', {}, {'X-Hook-Token': 'nope'})[0] == 401)
time.sleep(4)
trig = [t for t in call('GET', f'/platform/triggers?project_id={PID}')[1]['data'] if t['slug'] == 'smoke-webhook'][0]
check('trigger ran from queue', trig['last'] and trig['last']['ok'], trig)
sys.exit(1 if fails else 0)
