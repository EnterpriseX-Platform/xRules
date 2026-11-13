#!/usr/bin/env python3
"""Smoke test: vocabulary terms, sentence check (good + bad), save as rule, run it, read back."""
import json, sys, urllib.request, urllib.error
B = 'http://localhost:4000'; T = None
def call(m, p, b=None):
    rq = urllib.request.Request(B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + T} if T else {})})
    try:
        with urllib.request.urlopen(rq, timeout=60) as r: return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')
T = call('POST', '/auth/login', {'email': 'admin@example.com', 'password': 'admin123'})[1]['data']['access_token']
projects = call('GET', '/projects')[1]['data']; projects = projects.get('items', projects) if isinstance(projects, dict) else projects
PID = next(p['id'] for p in projects if p['slug'] == 'neb-pre-screening')
fails = 0
def check(name, cond, got=None):
    global fails; print(('PASS ' if cond else 'FAIL ') + name, '' if cond else got); fails += 0 if cond else 1
for t in [('unit price', 'item.unitPrice', 'number'), ('standard price', 'item.ref.standardPrice.unitPrice', 'number'),
          ('budget type', 'item.budgetType', 'enum', ['equipment', 'land and buildings']), ('quantity', 'item.qty', 'number')]:
    call('POST', '/platform/vocabulary', {'projectId': PID, 'term': t[0], 'path': t[1], 'type': t[2], 'values': t[3] if len(t) > 3 else []})
s = 'IF budget type IS "equipment" AND unit price GREATER THAN 25,000 THEN WARN "Unit price is above the equipment cap" LEVEL WARNING CODE NEB-CAP-01'
st, r = call('POST', '/platform/vocabulary/check', {'projectId': PID, 'sentence': s})
check('good sentence compiles', r['data']['ok'] and 'Number(get(item' in r['data']['source'], r)
check('reads back the same sentence', r['data']['canonical'] == s, r['data'].get('canonical'))
st, r = call('POST', '/platform/vocabulary/check', {'projectId': PID, 'sentence': 'IF unit pricee GREATER THAN 1 THEN WARN "x"'})
check('unknown word suggests unit price', not r['data']['ok'] and 'unit price' in (r['data']['errors'][0].get('suggestions') or []), r)
st, r = call('POST', '/platform/vocabulary/check', {'projectId': PID, 'sentence': 'IF budget type IS "vehicle" THEN FAIL "x" LEVEL ERROR'})
check('enum value checked', not r['data']['ok'], r)
st, rule = call('POST', '/platform/vocabulary/rules', {'projectId': PID, 'name': 'neb-cap-01', 'sentence': s})
check('saved as rule', st == 201 and rule['data']['definition']['language'] == 'rule-sentence', rule)
st, out = call('POST', '/execute', {'rule_id': rule['data']['id'], 'input': {'items': [{'lineId': 'L-1', 'budgetType': 'equipment', 'unitPrice': 30000}, {'lineId': 'L-2', 'budgetType': 'equipment', 'unitPrice': 1000}]}})
o = out.get('data', out); o = o.get('output', o)
check('rule finds only L-1', [f['lineId'] for f in o.get('findings', [])] == ['L-1'], out)
sys.exit(1 if fails else 0)
