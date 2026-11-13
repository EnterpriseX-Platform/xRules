# xRules Studio (web) — UAT image served under a sub-path.
FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_BASE_PATH=/xrules
ARG NEXT_PUBLIC_BACKEND_URL=/xrules-api
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json turbo.json ./
COPY apps/xrules-studio/package.json apps/xrules-studio/
RUN npm ci --workspace apps/xrules-studio --include-workspace-root --ignore-scripts
COPY apps/xrules-studio ./apps/xrules-studio
WORKDIR /app/apps/xrules-studio
RUN mkdir -p public && npm run build

FROM node:20-alpine
RUN apk add --no-cache tini tzdata && addgroup -S app && adduser -S app -G app
ENV TZ=Asia/Bangkok NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=app:app /app/apps/xrules-studio/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/xrules-studio/.next/static ./apps/xrules-studio/.next/static
COPY --from=build --chown=app:app /app/apps/xrules-studio/public ./apps/xrules-studio/public
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/xrules-studio/server.js"]
