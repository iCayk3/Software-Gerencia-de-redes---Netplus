# ==============================================================================
# NetPulse Frontend Dockerfile - Multi-Stage Build (Node 22 / Nginx Alpine)
# ==============================================================================

# --- Stage 1: Build React/Vite Assets ---
FROM node:22-alpine AS builder

WORKDIR /app

# Cache node dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# --- Stage 2: Nginx Web Server & Reverse Proxy ---
FROM nginx:alpine

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
