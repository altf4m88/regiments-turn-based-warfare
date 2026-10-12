# Regiments is a static single-page app: Vite compiles it to plain files and a
# small nginx serves them. Built for Google Cloud Run (listens on $PORT).

# ---- Build -----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Serve -----------------------------------------------------------------
# Unprivileged nginx (runs as uid 101). The official entrypoint renders
# /etc/nginx/templates/*.template with environment variables, so the server
# listens on whatever $PORT Cloud Run assigns (8080 by default).
FROM nginxinc/nginx-unprivileged:1.28-alpine

ENV PORT=8080
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
