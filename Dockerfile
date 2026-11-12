# One image for the whole workspace; docker-compose.yml picks the command per service.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so source edits don't invalidate the npm ci layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run build -w @codeyoung/web
