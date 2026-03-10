# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Production image with Chromium for Puppeteer and whois
FROM node:20-alpine
WORKDIR /app

# Install Chromium, whois, and dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    whois \
    bind-tools \
    && rm -rf /var/cache/apk/*

# Tell Puppeteer to use the Chromium from alpine
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install production dependencies for backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory for images
RUN mkdir -p /data/images

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV PVC_MOUNT_PATH=/data/images

EXPOSE 3000

CMD ["node", "dist/index.js"]
