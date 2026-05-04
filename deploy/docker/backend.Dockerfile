# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Workspace root
COPY package.json package-lock.json turbo.json ./
COPY apps/xrules-backend/package.json apps/xrules-backend/
RUN npm install --workspaces --include-workspace-root

COPY apps/xrules-backend ./apps/xrules-backend
WORKDIR /app/apps/xrules-backend

RUN npx prisma generate
RUN npm run build

# Runtime stage — small, no dev deps
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/xrules-backend /app/apps/xrules-backend
WORKDIR /app/apps/xrules-backend

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4000/health || exit 1

EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
