#!/usr/bin/env python3
"""End-to-end demo of the Data Layer with the NEB Pre-screening case (TOR 4.4).

Creates (or reuses) a project, a read-only Postgres connection to the sample `neb_src`
schema, three Data Flows, script rules for TOR 4.4.1.1-6, a File Template, the decision
flow `neb-prescreen`, an API key, then calls the public endpoint with a sample request.

usage: python3 scripts/neb-prescreen-demo.py [--base http://localhost:4000]
"""
import json, sys, base64, io, urllib.request, urllib.error

BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://localhost:4000'
TOKEN = None

def call(method, path, body=None, headers=None, ok=(200, 201)):
    h = {'Content-Type': 'application/json', **(headers or {})}
    if TOKEN and 'X-API-Key' not in h:
        h['Authorization'] = f'Bearer {TOKEN}'
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} -> {e.code}: {e.read().decode()[:400]}')
    return out.get('data', out) if isinstance(out, dict) and 'success' in out else out

login = call('POST', '/auth/login', {'email': 'admin@example.com', 'password': 'admin123'})
TOKEN = login.get('access_token') or login.get('accessToken')
projects = call('GET', '/projects')
projects = projects.get('items', projects) if isinstance(projects, dict) else projects
proj = next((p for p in projects if p['slug'] == 'neb-pre-screening'), None) or call('POST', '/projects', {'name': 'NEB Pre-screening'})
PID = proj['id']
print('project', proj['slug'])

# ---- connection (read-only account on the sample source schema)
conns = call('GET', f'/connections?project_id={PID}')
conn = next((c for c in conns if c['slug'] == 'neb-src-ro'), None) or call('POST', '/connections', {
    'name': 'neb-src-ro', 'projectId': PID, 'type': 'postgres',
    'config': {'envs': {'UAT': {'host': 'localhost', 'port': 5461, 'user': 'xrules_ro', 'password': 'ro_pass', 'database': 'xrulesdb'}},
               'allowedObjects': ['neb_src.das_standard_price', 'neb_src.prior_requests', 'neb_src.budget_codes']}})
t = call('POST', f"/data/connections/{conn['id']}/test")
print('connection test', t)

# ---- data flows
def data_flow(name, sql, mapping, dataset, key, checks=None, unique=None, cron='0 23 * * *'):
    graph = {'nodes': [
        {'id': 't', 'type': 'trigger', 'data': {'label': 'Nightly'}},
        {'id': 's', 'type': 'source', 'data': {'connection': 'neb-src-ro', 'sql': sql}},
        {'id': 'm', 'type': 'map', 'data': {'fields': mapping}},
        {'id': 'q', 'type': 'quality', 'data': {'checks': checks or [], 'unique': unique or key, 'minRowRatio': 0.9}},
        {'id': 'w', 'type': 'write', 'data': {'dataset': dataset, 'keyFields': key}},
    ], 'edges': [{'source': a, 'target': b} for a, b in [('t', 's'), ('s', 'm'), ('m', 'q'), ('q', 'w')]]}
    flows = call('GET', f'/flows?project_id={PID}&kind=data')
    flows = flows.get('items', flows) if isinstance(flows, dict) else flows
    f = next((x for x in flows if x['name'] == name), None)
    if f:
        call('PUT', f"/flows/{f['id']}", {'graph': graph, 'schedule': {'cron': cron}})
    else:
        f = call('POST', '/flows', {'name': name, 'projectId': PID, 'kind': 'DATA', 'graph': graph, 'schedule': {'cron': cron}})
    call('POST', f"/flows/{f['id']}/publish", {'message': 'demo'})
    pv = call('POST', f"/data/flows/{f['id']}/preview")
    run = call('POST', f"/data/flows/{f['id']}/run")
    print(f'data flow {name}: preview ok={pv["ok"]} rows={pv.get("rowCount")} rejected={pv.get("rejectedCount")} · run ok={run["ok"]} rows={run.get("rowCount")} {run.get("error","")}')

data_flow('DAS standard price', 'SELECT item_code, item_name, unit, unit_price, fiscal_year FROM neb_src.das_standard_price',
          {'itemCode': 'item_code', 'name': 'item_name', 'unit': 'unit', 'unitPrice': 'Number(unit_price)', 'fiscalYear': 'fiscal_year'},
          'das-standard-price', ['itemCode', 'fiscalYear'], checks=[{'name': 'unitPrice > 0', 'expression': 'unitPrice > 0', 'onFail': 'reject_row'}])
data_flow('Prior budget requests', 'SELECT fiscal_year, agency_code, area_code, item_code, request_no FROM neb_src.prior_requests',
          {'fiscalYear': 'fiscal_year', 'agencyCode': 'agency_code', 'areaCode': 'area_code', 'itemCode': 'item_code', 'requestNo': 'request_no'},
          'prior-requests', ['agencyCode', 'areaCode', 'itemCode'], unique=[])
data_flow('Budget item codes', 'SELECT item_code, budget_type FROM neb_src.budget_codes',
          {'itemCode': 'item_code', 'budgetType': 'budget_type'}, 'budget-codes', ['itemCode'])

# ---- rules (script rules returning findings)
RULES = {
 'tor-4-4-1-1-required': """const f=[];for(const it of input.items||[]){for(const k of ['itemCode','qty','unitPrice','amount','budgetType']){if(it[k]===undefined||it[k]===null||it[k]==='')f.push({lineId:it.lineId,field:k,message:`Line ${it.lineId}: ${k} is required`})}}return {findings:f};""",
 'tor-4-4-1-3-standard-price': """const f=[];for(const it of input.items||[]){const sp=it.ref&&it.ref.standardPrice;if(sp&&it.unitPrice>sp.unitPrice)f.push({lineId:it.lineId,field:'unitPrice',severity:'WARNING',message:`Unit price ${it.unitPrice.toLocaleString()} THB is above the standard price ${sp.unitPrice.toLocaleString()} THB`,ref:{standardPrice:sp.unitPrice}})}return {findings:f};""",
 'tor-4-4-1-4-unit-price': """const f=[];for(const it of input.items||[]){if(Math.abs(it.qty*it.unitPrice-it.amount)>0.009)f.push({lineId:it.lineId,field:'amount',message:`Quantity ${it.qty} × unit price ${it.unitPrice} does not equal amount ${it.amount}`})}return {findings:f};""",
 'tor-4-4-1-5-budget-type': """const f=[];for(const it of input.items||[]){const bc=it.ref&&it.ref.budgetCode;if(!bc)f.push({lineId:it.lineId,field:'itemCode',message:`Item code ${it.itemCode} is not in the expenditure register`});else if(bc.budgetType!==it.budgetType)f.push({lineId:it.lineId,field:'budgetType',message:`Item ${it.itemCode} must be budget type ${bc.budgetType}, not ${it.budgetType}`})}return {findings:f};""",
 'tor-4-4-1-6-duplicate': """const f=[];for(const it of input.items||[]){const p=it.ref&&it.ref.prior;if(p)f.push({lineId:it.lineId,field:'itemCode',severity:'WARNING',message:`Duplicates request ${p.requestNo} of FY${p.fiscalYear} (same agency, area and item)`})}return {findings:f};""",
}
existing = call('GET', f'/rules?project_id={PID}&limit=100')
existing = existing.get('data', existing.get('items', existing)) if isinstance(existing, dict) else existing
for slug, src in RULES.items():
    r = next((x for x in existing if x['slug'] == slug), None)
    if r:
        call('PUT', f"/rules/{r['id']}", {'definition': {'source': src}})
    else:
        call('POST', '/rules', {'name': slug, 'project_id': PID, 'type': 'SCRIPT', 'definition': {'source': src}})
print('rules', len(RULES))

# ---- file template
tpls = call('GET', f'/data/file-templates?project_id={PID}')
if not any(x['code'] == 'BUDREQ-01' for x in tpls):
    call('POST', '/data/file-templates', {'projectId': PID, 'code': 'BUDREQ-01', 'name': 'Equipment request form', 'spec': {
        'extensions': ['.xlsx'], 'maxBytes': 5 * 1024 * 1024,
        'sheets': [{'name': 'Details', 'headerRow': 1, 'columns': [
            {'name': 'Item', 'type': 'string', 'required': True}, {'name': 'Quantity', 'type': 'number', 'required': True},
            {'name': 'Unit price', 'type': 'number', 'required': True}, {'name': 'Amount', 'type': 'number', 'required': True}]}]}})

# ---- decision flow
rc = lambda id_, slug, code, sev='ERROR': {'id': id_, 'type': 'ruleCall', 'data': {'ruleSlug': slug, 'ruleCode': code, 'severity': sev, 'outputAs': id_}}
dgraph = {'nodes': [
    {'id': 'in', 'type': 'input', 'data': {}},
    {'id': 'e1', 'type': 'enrich', 'data': {'dataset': 'das-standard-price', 'forEach': 'input.items', 'key': ['{{item.itemCode}}', '{{input.context.fiscalYear}}'], 'writeTo': 'ref.standardPrice', 'ruleCodes': ['TOR-4.4.1.3']}},
    {'id': 'e2', 'type': 'enrich', 'data': {'dataset': 'budget-codes', 'forEach': 'input.items', 'key': ['{{item.itemCode}}'], 'writeTo': 'ref.budgetCode', 'ruleCodes': ['TOR-4.4.1.5']}},
    {'id': 'e3', 'type': 'enrich', 'data': {'dataset': 'prior-requests', 'forEach': 'input.items', 'key': ['{{input.context.agencyCode}}', '{{input.context.areaCode}}', '{{item.itemCode}}'], 'writeTo': 'ref.prior', 'ruleCodes': ['TOR-4.4.1.6']}},
    {'id': 'fc', 'type': 'filecheck', 'data': {'files': 'input.files', 'ruleCode': 'TOR-4.4.1.7'}},
    rc('r1', 'tor-4-4-1-1-required', 'TOR-4.4.1.1'), rc('r3', 'tor-4-4-1-3-standard-price', 'TOR-4.4.1.3', 'WARNING'),
    rc('r4', 'tor-4-4-1-4-unit-price', 'TOR-4.4.1.4'), rc('r5', 'tor-4-4-1-5-budget-type', 'TOR-4.4.1.5'),
    rc('r6', 'tor-4-4-1-6-duplicate', 'TOR-4.4.1.6', 'WARNING'),
    {'id': 'out', 'type': 'findings', 'data': {}},
], 'edges': [{'source': a, 'target': b} for a, b in [('in', 'e1'), ('e1', 'e2'), ('e2', 'e3'), ('e3', 'fc'), ('fc', 'r1'), ('r1', 'r3'), ('r3', 'r4'), ('r4', 'r5'), ('r5', 'r6'), ('r6', 'out')]]}
flows = call('GET', f'/flows?project_id={PID}')
flows = flows.get('items', flows) if isinstance(flows, dict) else flows
df = next((x for x in flows if x['slug'] == 'neb-prescreen'), None)
if df:
    call('PUT', f"/flows/{df['id']}", {'graph': dgraph})
else:
    df = call('POST', '/flows', {'name': 'neb prescreen', 'projectId': PID, 'kind': 'DECISION', 'graph': dgraph})
call('POST', f"/flows/{df['id']}/publish", {'message': 'demo'})

# ---- sample Excel missing the "Amount" column
try:
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = 'Details'
    ws.append(['Item', 'Quantity', 'Unit price']); ws.append(['All-in-one computer', 4, 28500])
    bio = io.BytesIO(); wb.save(bio); xlsx_b64 = base64.b64encode(bio.getvalue()).decode()
except ImportError:
    xlsx_b64 = None

# ---- REST API: POST /prescreen → decision flow, GET /standard-price/{itemCode} → Data Set lookup
specs = call('GET', f'/platform/specs?project_id={PID}')
spec = next((x for x in specs if x['basePath'] == 'neb-prescreen'), None) or call('POST', '/platform/specs', {'projectId': PID, 'name': 'NEB Pre-screening API', 'basePath': 'neb-prescreen', 'version': 1, 'description': 'TOR 4.4 pre-screening'})
ops = {(o['method'], o['path']): o for o in (call('GET', f"/platform/specs/{spec['id']}")['operations'] or [])}
op1 = ops.get(('POST', '/prescreen')) or call('POST', f"/platform/specs/{spec['id']}/operations", {'method': 'POST', 'path': '/prescreen', 'summary': 'Check a budget request (TOR 4.4)',
    'requestSchema': {'type': 'object', 'required': ['context', 'items'], 'properties': {'context': {'type': 'object'}, 'items': {'type': 'array'}}}})
op2 = ops.get(('GET', '/standard-price/{itemCode}')) or call('POST', f"/platform/specs/{spec['id']}/operations", {'method': 'GET', 'path': '/standard-price/{itemCode}', 'summary': 'DAS standard price'})
call('PUT', f"/flows/{op1['flowId']}", {'graph': {'nodes': [{'id': 'in', 'type': 'apiInput', 'data': {}}, {'id': 'd', 'type': 'callDecisionFlow', 'data': {'flow': df['slug'], 'inputMap': '{{input.body}}', 'outputAs': 'decision'}}, {'id': 'out', 'type': 'apiResponse', 'data': {'status': 200, 'body': '{{decision}}'}}],
    'edges': [{'source': 'in', 'target': 'd'}, {'source': 'd', 'target': 'out'}]}})
call('PUT', f"/flows/{op2['flowId']}", {'graph': {'nodes': [{'id': 'in', 'type': 'apiInput', 'data': {}}, {'id': 'l', 'type': 'lookup', 'data': {'dataset': 'das-standard-price', 'key': ['{{input.params.itemCode}}', '{{input.query.fiscalYear}}'], 'outputAs': 'price'}}, {'id': 'out', 'type': 'apiResponse', 'data': {'status': 200, 'body': {'itemCode': '{{input.params.itemCode}}', 'price': '{{price}}'}}}],
    'edges': [{'source': 'in', 'target': 'l'}, {'source': 'l', 'target': 'out'}]}})
call('POST', f"/platform/specs/{spec['id']}/publish", {})
print('api', spec['url'] if 'url' in spec else '/api/neb-prescreen/v1')

key = call('POST', '/api-keys', {'name': 'bpn-demo', 'scopes': ['execute'], 'specIds': [spec['id']], 'systemName': 'BPN'})
api_key = key.get('key') or key.get('plainKey') or key.get('apiKey')
req = {'context': {'action': 'SUBMIT', 'fiscalYear': 2571, 'agencyCode': '03007', 'areaCode': '10'},
       'items': [{'lineId': 'L-001', 'budgetType': 'equipment', 'itemCode': 'DAS-1203-0045', 'qty': 4, 'unitPrice': 28500, 'amount': 114000},
                 {'lineId': 'L-002', 'budgetType': 'equipment', 'itemCode': 'DAS-1203-0050', 'qty': 2, 'unitPrice': 7500, 'amount': 15000}],
       'files': ([{'fileId': 'F-77', 'name': 'equipment_request.xlsx', 'templateCode': 'BUDREQ-01', 'contentBase64': xlsx_b64}] if xlsx_b64 else [])}
out = call('POST', '/api/neb-prescreen/v1/prescreen', req, headers={'X-API-Key': api_key})
print(json.dumps(out, ensure_ascii=False, indent=1))
