#!/usr/bin/env bash
# XRules — one-line installer.
#   curl -fsSL https://xrules.dev/install | sh
# (Or:  bash install.sh  inside a checked-out repo.)

set -euo pipefail

REPO_URL="${XRULES_REPO_URL:-https://github.com/hacka/xrules.git}"
BRANCH="${XRULES_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/xrules}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
warn() { printf "\033[33m%s\033[0m\n" "$*"; }
err()  { printf "\033[31m%s\033[0m\n" "$*" >&2; exit 1; }

bold "==> Checking prerequisites"
command -v docker         >/dev/null 2>&1 || err "Docker not found. Install Docker Engine 20.10+ and re-run."
docker compose version >/dev/null 2>&1 || err "Docker Compose v2 plugin not found. Install Docker Compose v2."
command -v openssl        >/dev/null 2>&1 || err "openssl not found. Install it (used to generate secrets)."
command -v git            >/dev/null 2>&1 || err "git not found. Install it."

bold "==> Cloning repo"
if [ -d "$INSTALL_DIR/.git" ]; then
  warn "Already cloned at $INSTALL_DIR; pulling latest"
  git -C "$INSTALL_DIR" fetch --depth=1
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

bold "==> Generating .env"
if [ ! -f .env ]; then
  cp .env.example .env
  JWT=$(openssl rand -hex 32)
  ENC=$(openssl rand -hex 32)
  PG=$(openssl rand -hex 16)
  # macOS sed needs an empty arg for -i, GNU sed does not. Try GNU-style first.
  sed -i.bak \
    -e "s|JWT_SECRET=.*|JWT_SECRET=$JWT|" \
    -e "s|CONNECTION_ENC_KEY=.*|CONNECTION_ENC_KEY=$ENC|" \
    -e "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG|" \
    .env
  rm -f .env.bak
  bold "    Generated fresh JWT_SECRET, CONNECTION_ENC_KEY, POSTGRES_PASSWORD"
else
  warn "Existing .env detected — leaving alone"
fi

bold "==> Building images and starting stack"
docker compose -f docker-compose.production.yml up -d --build

bold "==> Waiting for backend to come up"
for i in $(seq 1 60); do
  if curl -fsS http://localhost:4000/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://localhost:4000/health >/dev/null 2>&1 || err "Backend did not start within 60s. Check 'docker compose logs backend'."

bold "==> Initialising database"
docker compose -f docker-compose.production.yml exec -T backend npx prisma db push
docker compose -f docker-compose.production.yml exec -T backend npm run db:seed

bold "==> Done!"
cat <<EOF

Studio:    http://localhost:3000
Backend:   http://localhost:4000
Login:     admin@example.com / admin123

Next steps:
  - Read the docs at https://xrules.dev/docs
  - Edit $INSTALL_DIR/.env to add OPENAI_API_KEY / ANTHROPIC_API_KEY for AI Agents
  - Stop with:   docker compose -f $INSTALL_DIR/docker-compose.production.yml down
  - Upgrade:     git -C $INSTALL_DIR pull && docker compose -f docker-compose.production.yml up -d --build

EOF
