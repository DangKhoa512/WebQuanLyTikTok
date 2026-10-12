# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci --prefer-offline

COPY frontend/ .
RUN npm run build

# ── Stage 2: nginx serves built files + proxies /api ──────────────────────────
FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy built frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our nginx config
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/device-ws.conf /etc/nginx/snippets/device-ws.conf
COPY nginx/device-manager-https.conf.example /etc/nginx/examples/device-manager-https.conf.example

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
