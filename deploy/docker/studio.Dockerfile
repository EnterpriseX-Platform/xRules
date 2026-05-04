# Build stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY apps/xrules-studio/package.json apps/xrules-studio/
RUN npm install --workspaces --include-workspace-root

COPY apps/xrules-studio ./apps/xrules-studio
WORKDIR /app/apps/xrules-studio

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime — serve via `next start`
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/xrules-studio /app/apps/xrules-studio
WORKDIR /app/apps/xrules-studio

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000 || exit 1

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "next", "start", "-p", "3000"]
