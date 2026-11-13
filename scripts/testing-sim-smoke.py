#!/usr/bin/env python3
"""Smoke test: test cases on a decision flow and an operation, publish gate, backtest, challenger, review."""
import json, sys, time, urllib.request, urllib.error
B = 'http://localhost:4000'; T = None
def call(m, p, b=None, h=None):
    hh = {'Content-Type': 'application/json', **(h or {})}
    if T and 'X-API-Key' not in hh: hh['Authorization'] = 'Bearer ' + T
    rq = urllib.request.Request(B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers=hh)
    try:
        with urllib.request.urlopen(rq, timeout=180) as r: return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')
T = call('POST', '/auth/login', {'email': 'admin@example.com', 'password': 'admin123'})[1]['data']['access_token']
projects = call('GET', '/projects')[1]['data']; projects = projects.get('items', projects) if isinstance(projects, dict) else projects
PID = next(p['id'] for p in projects if p['slug'] == 'neb-pre-screening')
flow = next(f for f in call('GET', f'/flows?project_id={PID}')[1]['data'] if f['slug'] == 'neb-prescreen')
fails = 0
def check(name, cond, got=None):
    global fails; print(('PASS ' if cond else 'FAIL ') + name, '' if cond else got); fails += 0 if cond else 1
ctx = {'fiscalYear': 2571, 'agencyCode': '03007', 'areaCode': '10'}
over = {'context': ctx, 'items': [{'lineId': 'L-1', 'budgetType': 'ครุภัณฑ์', 'itemCode': 'DAS-1203-0045', 'qty': 1, 'unitPrice': 30000, 'amount': 30000}]}
ok = {'context': ctx, 'items': [{'lineId': 'L-1', 'budgetType': 'ครุภัณฑ์', 'itemCode': 'DAS-1203-0045', 'qty': 1, 'unitPrice': 20000, 'amount': 20000}]}
existing = {c['name'] for c in call('GET', f'/platform/tests?project_id={PID}&targetId={flow["id"]}')[1]['data']}
cases = [('ราคาเกินมาตรฐาน → WARNING 4.4.1.3', over, [{'kind': 'has_finding', 'code': 'TOR-4.4.1.3', 'severity': 'WARNING'}, {'kind': 'max_ms', 'value': 3000}]),
         ('คำขอปกติ → ผ่าน', ok, [{'kind': 'equals', 'path': '$.passed', 'value': True}, {'kind': 'no_finding', 'code': 'TOR-4.4.1.3'}])]
for name, inp, exps in cases:
    if name not in existing: call('POST', '/platform/tests', {'projectId': PID, 'name': name, 'targetType': 'decision_flow', 'targetId': flow['id'], 'input': inp, 'expectations': exps})
st, r = call('POST', f'/platform/tests/target/decision_flow/{flow["id"]}/run')
check('decision flow cases pass', st == 200 and r['data']['passed'] == r['data']['total'] >= 2, r)
# a failing case blocks publish
st, bad = call('POST', '/platform/tests', {'projectId': PID, 'name': 'กรณีที่ตั้งใจให้ไม่ผ่าน ' + str(time.time()), 'targetType': 'decision_flow', 'targetId': flow['id'], 'input': ok, 'expectations': [{'kind': 'has_finding', 'code': 'TOR-9.9.9'}]})
st, o = call('POST', f'/flows/{flow["id"]}/publish', {})
check('publish blocked by failing test (409)', st == 409, (st, o))
call('PUT', f'/platform/tests/{bad["data"]["id"]}', {'expectations': [{'kind': 'no_finding', 'code': 'TOR-9.9.9'}]})
st, o = call('POST', f'/flows/{flow["id"]}/publish', {})
check('publish allowed once tests pass', st == 200, (st, o))
# backtest over past inputs
st, bt = call('POST', '/platform/simulations/backtest', {'projectId': PID, 'flow': 'neb-prescreen', 'limit': 50})
check('backtest started', st == 201, bt)
for _ in range(60):
    a = call('GET', f"/platform/bulk/{bt['data']['draftRunId']}")[1]['data']; b = call('GET', f"/platform/bulk/{bt['data']['liveRunId']}")[1]['data']
    if a['status'] == b['status'] == 'COMPLETED': break
    time.sleep(1)
st, cmp = call('GET', f"/platform/bulk/{bt['data']['draftRunId']}/compare/{bt['data']['liveRunId']}")
check('backtest compare works (draft == live → 0 changed)', st == 200 and cmp['data']['changed'] == 0, cmp)
# challenger at 100% sampling for the draft
call('PUT', f'/platform/flows/{flow["id"]}/challenger', {'sampleRate': 1})
spec = next(x for x in call('GET', f'/platform/specs?project_id={PID}')[1]['data'] if x['basePath'] == 'neb-prescreen')
key = call('POST', '/api-keys', {'name': 'smoke-ch', 'specIds': [spec['id']]})[1]['data']['key']
for _ in range(3): call('POST', '/api/neb-prescreen/v1/prescreen', over, {'X-API-Key': key})
time.sleep(2)
s = call('GET', f'/platform/flows/{flow["id"]}/challenger')[1]['data']['summary']
check('challenger recorded runs', s['total'] >= 3 and s['same'] == s['total'], s)
call('PUT', f'/platform/flows/{flow["id"]}/challenger', {'off': True})
# review: submit then self-approve is refused
st, rv = call('POST', '/platform/reviews', {'targetType': 'decision_flow', 'targetId': flow['id'], 'note': 'ทดสอบ'})
check('review submitted', st == 201, rv)
st, o = call('POST', f"/platform/reviews/{rv['data']['id']}/approve", {'note': 'ok'})
check('self-approval refused (403)', st == 403, (st, o))
sys.exit(1 if fails else 0)
