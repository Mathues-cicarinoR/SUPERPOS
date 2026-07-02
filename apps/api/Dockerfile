# apps/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root lockfile and package.json files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install all dependencies (including devDependencies to compile TypeScript)
RUN npm ci

# Copy API files and compile it
COPY apps/api ./apps/api
RUN npm run build --workspace=apps/api

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Expose API port
EXPOSE 8000
ENV PORT=8000
ENV NODE_ENV=production

# DB and backups persistence fallback (in case PostgreSQL DATABASE_URL is not used)
ENV DB_PATH=/app/data/database.db
ENV BACKUP_DIR=/app/data/backups
RUN mkdir -p /app/data
VOLUME /app/data

CMD ["npm", "start", "--workspace=apps/api"]
