FROM node:22-alpine

WORKDIR /app

# wget powers the HEALTHCHECK below.
RUN apk add --no-cache wget

# Lockfile + manifest first for layer caching.
COPY package.json package-lock.json ./

# npm ci is deterministic — same package-lock.json → same dep tree across
# rebuilds. (Was `npm install`, which silently drifted across builds.)
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.js ./

# Persistent state directories — created here so the chown below sets the
# right ownership before USER switch.
RUN mkdir -p ./.rooms ./.assets \
 && addgroup -S app \
 && adduser -S -G app app \
 && chown -R app:app /app

USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:3001/health || exit 1

# Exec form so signals (SIGTERM from docker stop) reach Node directly —
# `npm start` would swallow them and defeat the shutdown handler.
CMD ["node", "server.js"]
