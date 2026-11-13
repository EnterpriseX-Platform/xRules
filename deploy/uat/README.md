# xRules on NEB UAT

| Item | Value |
|---|---|
| URL | https://uat-neb.bb.go.th/xrules/ (Studio) · https://uat-neb.bb.go.th/xrules-api/ (API, gateway at `/xrules-api/api/{tenant}/…`) |
| Jenkins | `BB_UAT/xrules` on 10.1.102.208:32552 — params `COMPONENT` (both/api/web/engine/all), `GIT_REF` (default master) |
| Source | GitLab `bb/support/neb-xrules` (mirror of GitHub `EnterpriseX-Platform/xRules` main) |
| Namespace | `budget-bb` — deployments `xrules-api`, `xrules-web`, `xrules-engine`, `xrules-postgres` |
| Images | `registry.nipa.cloud/ebudet-bb-registry/neb-page:xrules-{api,web,engine}.<VERSION>` |
| Routing | VirtualServer `budget-bb-virtualserver-ext`: `/xrules` → xrules-web-svc:3000, `/xrules-api/` → xrules-api-svc:4000 (rewritten to `/`) |

Secret `xrules-secret` (not in Git) holds `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
The API runs `prisma migrate deploy` on start. The first user signs up at `/xrules/signup` (creates their tenant).

```bash
kubectl apply -f deploy/uat/k8s.yaml          # one-time; Jenkins only swaps image tags afterwards
```
