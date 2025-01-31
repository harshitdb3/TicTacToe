# Stage 1: Build environment
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Stage 2: Runtime environment
FROM node:20-alpine
WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.js ./

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Security hardening
RUN apk add --no-cache tini
USER node
EXPOSE 8080

# Set entrypoint and command
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]