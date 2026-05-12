# syntax=docker/dockerfile:1.7
#
# TLDraw — production image.
#
# Stages:
#   build    — install deps + vite build → /app/dist
#   dev      — node:22-alpine + vite dev server (used by docker-compose.dev.yml
#              via `target: dev`)
#   runtime  — (default) nginx:alpine serving /app/dist; this is the last
#              stage so plain `docker build` resolves to it
#
# Replaces the v1.3 pattern of `serve -s dist` (a Node dev tool shipped to
# prod, no security headers, no compression config) with an alpine nginx
# multi-stage build.

# ---- build -----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# ---- dev (for docker-compose.dev.yml; selected via `target: dev`) ----------
FROM node:22-alpine AS dev
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Source is mounted at runtime by docker-compose.dev.yml; this layer just
# bootstraps node_modules and the dev server entrypoint.
COPY index.html vite.config.js ./
COPY src ./src

EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- runtime (default) -----------------------------------------------------
FROM nginx:alpine AS runtime

# Drop the stock welcome page, then drop our config in. The stock
# default.conf serves the welcome page on :80; we replace it entirely with
# nginx.conf which listens on :3000.
RUN rm -f /etc/nginx/conf.d/default.conf /usr/share/nginx/html/index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

# Listening on 3000 (unprivileged) lets us run as the stock nginx user.
# nginx writes to /var/cache/nginx/* and /var/run/nginx.pid at startup,
# so those paths need to be owned by nginx before the USER switch.
# We also dump access/error logs to /dev/stdout-stderr (the base image
# already symlinks these for us).
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx \
 && touch /var/run/nginx.pid \
 && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
