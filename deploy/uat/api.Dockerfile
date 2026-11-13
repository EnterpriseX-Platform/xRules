# xRules API (backend) — UAT image. Runs pending Prisma migrations, then starts.
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/xrules-backend/package.json apps/xrules-backend/
RUN npm ci --workspace apps/xrules-backend --include-workspace-root --ignore-scripts
COPY apps/xrules-backend ./apps/xrules-backend
WORKDIR /app/apps/xrules-backend
RUN npx prisma generate && npm run build

FROM node:20-alpine
RUN apk add --no-cache tini openssl tzdata && addgroup -S app && adduser -S app -G app
ENV TZ=Asia/Bangkok NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=app:app /app/node_modules /app/node_modules
COPY --from=build --chown=app:app /app/apps/xrules-backend /app/apps/xrules-backend
WORKDIR /app/apps/xrules-backend
USER app
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
