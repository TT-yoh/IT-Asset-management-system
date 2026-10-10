# ==============================================================================
# OmniAsset Enterprise IT Asset Management - Production Container
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm install

# Copy source code and build production assets
COPY . .
RUN npm run build

# ==============================================================================
# Production Runtime Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled frontend distribution from builder
COPY --from=builder /app/dist ./dist

# Copy backend server and database scripts
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/schema-tidb.sql ./schema-tidb.sql
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Expose standard application gateway port
EXPOSE 3001

# Run the unified Express API + Static SPA server
CMD ["npm", "start"]
