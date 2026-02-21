# XRules V2 Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the XRules V2 platform using Kustomize.

## Directory Structure

```
k8s/
├── base/                    # Base Kubernetes manifests
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── postgres/            # PostgreSQL StatefulSet
│   ├── redis/               # Redis Cache
│   ├── xrules-engine/       # Rule Engine Service
│   ├── xrules-api/          # REST API Service
│   └── xrules-studio/       # Web UI (Next.js)
├── overlays/                # Environment-specific overlays
│   ├── development/         # Dev environment
│   ├── staging/             # Staging environment
│   └── production/          # Production environment
└── monitoring/              # Prometheus & Grafana
    ├── prometheus/
    └── grafana/
```

## Quick Start

### Prerequisites

- Kubernetes cluster (v1.24+)
- kubectl configured
- Kustomize (built into kubectl v1.14+)
- NGINX Ingress Controller
- cert-manager (for TLS)

### Deploy to Development

```bash
# Deploy base manifests
kubectl apply -k base/

# Or deploy with development overlay
kubectl apply -k overlays/development/
```

### Deploy to Production

```bash
# Review production manifests first
kubectl kustomize overlays/production/

# Deploy to production
kubectl apply -k overlays/production/
```

## Services Overview

| Service | Type | Port | Description |
|---------|------|------|-------------|
| postgres | StatefulSet | 5432 | PostgreSQL database |
| redis | Deployment | 6379 | Redis cache |
| xrules-engine | Deployment | 50051 (gRPC), 9090 (metrics) | Rule execution engine |
| xrules-api | Deployment | 8080 | REST API server |
| xrules-studio | Deployment | 3000 | Next.js web application |
| prometheus | Deployment | 9090 | Metrics collection |
| grafana | Deployment | 3000 | Visualization dashboards |

## Configuration

### Secrets

Update secrets before deploying to production:

```bash
# Create production secrets manually
kubectl create secret generic xrules-secrets \
  --namespace=xrules-production \
  --from-literal=DATABASE_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=REDIS_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=JWT_SECRET=$(openssl rand -base64 64) \
  --dry-run=client -o yaml | kubectl apply -f -
```

Or use external secret management (e.g., AWS Secrets Manager, Vault).

### ConfigMap

Environment-specific configurations are in `overlays/*/kustomization.yaml`.

### Resource Limits

Production resource limits are defined in `overlays/production/resource-limits.yaml`.

## Horizontal Pod Autoscaling

All services have HPA configured:

| Service | Min Replicas | Max Replicas | CPU Target | Memory Target |
|---------|-------------|--------------|------------|---------------|
| xrules-engine | 2 | 10 | 70% | 80% |
| xrules-api | 2 | 10 | 70% | 80% |
| xrules-studio | 2 | 6 | 70% | 80% |

Production HPA scales up to 20 replicas for engine and API.

## Ingress Configuration

### Development

- API: `api-dev.xrules.local`
- Studio: `studio-dev.xrules.local`, `dev.xrules.local`

### Staging

- API: `api-staging.xrules.io`
- Studio: `staging.xrules.io`

### Production

- API: `api.xrules.io`
- Studio: `xrules.io`, `studio.xrules.io`

## Monitoring

### Prometheus

Access Prometheus UI:
```bash
kubectl port-forward -n xrules svc/prometheus 9090:9090
```

### Grafana

Access Grafana UI:
```bash
kubectl port-forward -n xrules svc/grafana 3001:3000
```

Default credentials (change in production):
- Username: `admin`
- Password: `admin`

## Health Checks

| Service | Liveness | Readiness |
|---------|----------|-----------|
| postgres | pg_isready | pg_isready |
| redis | redis-cli ping | redis-cli ping |
| xrules-engine | gRPC health | gRPC health |
| xrules-api | /health/live | /health/ready |
| xrules-studio | /api/health | /api/health |

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n xrules
kubectl describe pod <pod-name> -n xrules
kubectl logs <pod-name> -n xrules
```

### Check Services

```bash
kubectl get svc -n xrules
kubectl get ingress -n xrules
```

### Debug Network

```bash
# Test database connectivity
kubectl run -it --rm debug --image=busybox:1.36 --restart=Never -n xrules -- nc -zv postgres 5432

# Test Redis connectivity
kubectl run -it --rm debug --image=busybox:1.36 --restart=Never -n xrules -- nc -zv redis 6379
```

## Security Considerations

1. **Non-root containers**: All services run as non-root users
2. **Read-only root filesystem**: Enabled where possible
3. **Security contexts**: Properly configured for each service
4. **Network policies**: Consider adding NetworkPolicies for additional isolation
5. **Secrets management**: Use external secret management in production
6. **TLS**: Enabled for all ingresses with cert-manager

## Maintenance

### Scaling

```bash
# Scale manually (disables HPA)
kubectl scale deployment xrules-api --replicas=5 -n xrules

# View HPA status
kubectl get hpa -n xrules
```

### Updates

```bash
# Rolling update
kubectl set image deployment/xrules-api xrules-api=xrules-api:v1.1.0 -n xrules

# Rollback
kubectl rollout undo deployment/xrules-api -n xrules
```

### Cleanup

```bash
# Remove all resources
kubectl delete -k overlays/production/

# Remove namespace (deletes everything)
kubectl delete namespace xrules-production
```

## Contributing

When adding new services:

1. Add manifests to `base/<service-name>/`
2. Include in `base/kustomization.yaml`
3. Add environment-specific overrides in `overlays/*/kustomization.yaml`
4. Update this README
