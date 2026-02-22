# XRules

Decision Management Platform with Visual Rule Designer

## 📁 Structure

```
XRULES/
├── apps/
│   ├── xrules-studio/     # Next.js 16 + Prisma + API Routes
│   └── xrules-engine/     # Go Worker (optional)
├── k8s/                   # Kubernetes manifests
├── scripts/               # Dev scripts
├── docker-compose.yml     # PostgreSQL only
└── README.md
```

## 🚀 Quick Start

```bash
# 1. Setup (install deps + database)
./scripts/setup.sh

# 2. Start development
./scripts/dev.sh

# 3. Open http://localhost:3000
```

## 🛠️ Manual Setup

```bash
# Start database
docker-compose up -d

# Setup app
cd apps/xrules-studio
npm install
npx prisma generate
npx prisma db push

# Start dev server
npm run dev
```

## 🗄️ Database

- **Host**: localhost:5433
- **User**: xrules
- **Password**: xrules_secret
- **Database**: xrulesdb

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `./scripts/setup.sh` | First time setup |
| `./scripts/dev.sh` | Start development |
| `./scripts/stop.sh` | Stop all services |

## 🐳 Services

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Logs
docker-compose logs -f postgres
```
