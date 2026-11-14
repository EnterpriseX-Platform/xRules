# xRules browser E2E

Real browser, real clicks (Playwright). Covers every screen (01) and the working functions: rules (02),
REST APIs / keys / triggers / Data Set syncs (03), tests / bulk runs / simulations / vocabulary / alerts /
access / tenant (04), projects / flow editor / connections / data set lookup / two-person approval with
tenant switching / webhooks / releases / members (05). Each test fails on any API 5xx, 404 or page error.

```bash
cd e2e && npm i && npx playwright install chromium
XR_EMAIL=… XR_PASSWORD=… npx playwright test            # against XR_BASE (default http://localhost:4580/xrules/)
```

UAT is behind a WAF, so drive the deployed pods through `uat-proxy.mjs` (see the header for the port-forwards),
then remove the test data with `cleanup-uat.sql`. Screenshots land in `shots/`, the HTML report in `report/`.
