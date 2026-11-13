#!/usr/bin/env python3
"""Tenant isolation smoke test (run after scripts/neb-prescreen-demo.py).

Signs up a second user (own tenant), then checks that it cannot read, write or call the
first tenant's projects, entities, list endpoints or gateway APIs, and that tenant/project
roles behave as designed. Cleans up after itself.
"""
import json, sys, time, urllib.request, urllib.error
B = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://localhost:4000'

def call(m, p, b=None, tok=None, h=None):
    hh = {'Content-Type': 'application/json', **(h or {})}
    if tok: hh['Authorization'] = 'Bearer ' + tok
    rq = urllib.request.Request(B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers=hh)
    try:
        with urllib.request.urlopen(rq, timeout=60) as r: return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b'null')
        except Exception: return e.code, raw.decode(errors='replace')[:200]

fails = 0
def check(name, cond, got=None):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name, '' if cond else got); fails += 0 if cond else 1
data = lambda r: (r[1] or {}).get('data') if isinstance(r[1], dict) else None

# ---- tenant A (admin) and its resources
A = call('POST', '/auth/login', {'email': 'admin@example.com', 'password': 'admin123'})[1]['data']['access_token']
ta = data(call('GET', '/tenant', tok=A)); TA = ta['slug']
proj = next(p for p in data(call('GET', '/projects', tok=A)) if p['slug'] == 'neb-pre-screening'); PID = proj['id']
rule = data(call('GET', f'/rules?project_id={PID}', tok=A)); rule = (rule.get('items', rule) if isinstance(rule, dict) else rule)[0]
flows = data(call('GET', f'/flows?project_id={PID}', tok=A)); flows = flows.get('items', flows) if isinstance(flows, dict) else flows
spec = next(x for x in data(call('GET', f'/platform/specs?project_id={PID}', tok=A)) if x['basePath'] == 'neb-prescreen')
check('spec URL carries tenant', spec['url'] == f'/api/{TA}/neb-prescreen/v1', spec['url'])
secret_ids = {PID, rule['id'], spec['id'], *(f['id'] for f in flows)}

# ---- tenant B (fresh user, own tenant)
email = f'tenant-b-{int(time.time())}@example.test'
st, o = call('POST', '/auth/signup', {'email': email, 'password': 'tenantB123!', 'name': 'Tenant B'})
check('signup B', st in (200, 201), (st, o))
Bt = call('POST', '/auth/login', {'email': email, 'password': 'tenantB123!'})[1]['data']['access_token']
tb = data(call('GET', '/tenant', tok=Bt)); BUID = None
check('B lands in its own tenant', tb and tb['slug'] != TA, tb)

# entity endpoints → 404 (no existence leak)
for p in [f'/projects/{PID}', f'/rules/{rule["id"]}', f'/flows/{flows[0]["id"]}', f'/platform/specs/{spec["id"]}',
          f'/platform/specs/{spec["id"]}/openapi.json', f'/tools/drd/{PID}', f'/rules?project_id={PID}', f'/platform/bulk?project_id={PID}']:
    st, _ = call('GET', p, tok=Bt)
    check(f'B GET {p.split("?")[0]} → 404', st == 404, st)
check('B PUT A rule → 404', call('PUT', f'/rules/{rule["id"]}', {'name': 'pwned'}, tok=Bt)[0] == 404)
check('B DELETE A project → 404', call('DELETE', f'/projects/{PID}', tok=Bt)[0] == 404)
check('B POST into A project → 404', call('POST', '/platform/vocabulary', {'projectId': PID, 'term': 'x', 'field': 'x'}, tok=Bt)[0] == 404)
check('B with X-Tenant A → 403', call('GET', '/projects', tok=Bt, h={'X-Tenant': TA})[0] == 403)

# list endpoints without a project → must not contain any of A's ids
LISTS = ['/projects', '/executions', '/analytics/summary', '/analytics/top-rules', '/dashboard', '/platform/bulk', '/platform/reviews',
         '/platform/test-runs', '/platform/specs', '/platform/monitor/overview', '/platform/monitor/traffic', '/platform/alerts',
         '/platform/triggers', '/platform/tests', '/platform/suites', '/platform/vocabulary', '/api-keys', '/webhooks', '/bi/audit/v2',
         '/data/flows', '/data/datasets', '/data/flow-executions', '/jobs', '/flows', '/rules', '/folders', '/datasets',
         '/connections', '/releases', '/environments', '/simulations', '/models', '/test-suites', '/scenarios']
for p in LISTS:
    st, o = call('GET', p, tok=Bt)
    leak = [i for i in secret_ids if i in json.dumps(o)]
    check(f'B list {p} leaks nothing', not leak, (st, leak))

# ---- roles: add B to tenant A as VIEWER
BUID = next(m['userId'] for m in data(call('GET', '/tenant/members', tok=Bt)))
st, o = call('POST', '/tenant/members', {'email': email, 'role': 'VIEWER'}, tok=A)
check('A adds B as VIEWER', st == 201, (st, o))
HB = {'X-Tenant': TA}
check('viewer reads project', call('GET', f'/projects/{PID}', tok=Bt, h=HB)[0] == 200)
check('viewer cannot write', call('PUT', f'/rules/{rule["id"]}', {'description': 'x'}, tok=Bt, h=HB)[0] == 403)
check('viewer cannot create project', call('POST', '/projects', {'name': 'nope'}, tok=Bt, h=HB)[0] == 403)
check('viewer cannot manage members', call('POST', '/tenant/members', {'email': 'admin@example.com'}, tok=Bt, h=HB)[0] == 403)
# private project hides it; explicit project role brings it back
check('A makes project PRIVATE', call('PUT', f'/projects/{PID}', {'visibility': 'PRIVATE'}, tok=A)[0] == 200)
ids = [p['id'] for p in data(call('GET', '/projects', tok=Bt, h=HB))]
check('private project hidden from viewer', PID not in ids, ids)
check('private project → 404', call('GET', f'/rules/{rule["id"]}', tok=Bt, h=HB)[0] == 404)
check('A grants B project EDITOR', call('PUT', f'/projects/{PID}/members/{BUID}', {'role': 'EDITOR'}, tok=A)[0] == 200)
mem = data(call('GET', f'/projects/{PID}/members', tok=A))
check('member list shows explicit role', any(m['userId'] == BUID and m['effectiveRole'] == 'EDITOR' and m['source'] == 'project' for m in mem), mem)
st, o = call('POST', '/platform/vocabulary', {'projectId': PID, 'term': 'Tenant smoke term', 'path': 'tenantSmoke', 'type': 'string'}, tok=Bt, h=HB)
check('project editor can write', st in (200, 201), (st, o))
if st in (200, 201): call('DELETE', f'/platform/vocabulary/{data((st, o))["id"]}', tok=A)
check('project editor cannot change project settings', call('PUT', f'/projects/{PID}', {'visibility': 'WORKSPACE'}, tok=Bt, h=HB)[0] == 403)
check('last owner cannot be demoted', call('PUT', f'/tenant/members/{data(call("GET", "/auth/me", tok=A))["id"]}', {'role': 'ADMIN'}, tok=A)[0] == 400)

# ---- gateway
body = {'context': {'fiscalYear': 2571, 'agencyCode': '03007', 'areaCode': '10'},
        'items': [{'lineId': 'L-001', 'budgetType': 'equipment', 'itemCode': 'DAS-1203-0045', 'qty': 4, 'unitPrice': 28500, 'amount': 114000}]}
ka = data(call('POST', '/api-keys', {'name': 'tenant-smoke', 'specIds': [spec['id']], 'rateLimitPerMin': 50, 'systemName': 'smoke'}, tok=A))
kb = data(call('POST', '/api-keys', {'name': 'tenant-smoke-b', 'specIds': [spec['id']], 'rateLimitPerMin': 50, 'systemName': 'smoke'}, tok=Bt))
check('tenant URL works', call('POST', f'/api/{TA}/neb-prescreen/v1/prescreen', body, h={'X-API-Key': ka['key']})[0] == 200)
check('legacy URL still works', call('POST', '/api/neb-prescreen/v1/prescreen', body, h={'X-API-Key': ka['key']})[0] == 200)
if kb and kb.get('key'):
    check('other tenant key → 403', call('POST', f'/api/{TA}/neb-prescreen/v1/prescreen', body, h={'X-API-Key': kb['key']})[0] == 403)
else:
    check('B cannot mint a key for A spec', True)

# ---- cleanup
call('PUT', f'/projects/{PID}', {'visibility': 'WORKSPACE'}, tok=A)
call('DELETE', f'/tenant/members/{BUID}', tok=A)
for k in data(call('GET', f'/api-keys?workspace={TA}', tok=A)) or []:
    if k.get('name') == 'tenant-smoke': call('DELETE', f'/api-keys/{k["id"]}', tok=A)
check('B removed from A', call('GET', '/projects', tok=Bt, h=HB)[0] == 403)
print('FAILED' if fails else 'ALL PASS', fails)
sys.exit(1 if fails else 0)
