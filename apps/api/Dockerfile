# Multi-stage build: compile with dev tools, ship a small image with production dependencies only.

# ---- 1. deps: install every dependency (TypeScript is needed to compile) ----
FROM node:24-alpine AS deps
WORKDIR /app
# Copy only the manifests first, so this slow layer is cached until dependencies change.
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. build: compile TypeScript to JavaScript in dist/ ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- 3. runtime: what actually runs ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# SQL migrations, applied by the one-shot migrate service before the API starts
COPY drizzle ./drizzle

# Don't run as root inside the container.
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/server.js"]
