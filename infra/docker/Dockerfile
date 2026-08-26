# Multi-stage Dockerfile for NOVA ORG monorepo services

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# Builder stage
FROM base AS builder
COPY . .
RUN npm ci

# Generate Prisma Client & Build internal packages first
RUN npm run prisma:generate -w @nova-org/db
RUN npm run build:packages

# Typecheck and Build all apps and workers
RUN npm run typecheck
RUN npm run build:apps

# Runner stage for Node.js backend services
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/workers ./workers

CMD ["node", "apps/api/dist/index.js"]
