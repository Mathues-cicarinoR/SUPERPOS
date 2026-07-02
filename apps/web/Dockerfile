# apps/web/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root lockfile and package.json files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy web files
COPY apps/web ./apps/web

# Build argument for the API URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the frontend
RUN npm run build --workspace=apps/web

# Nginx production stage to serve static files
FROM nginx:alpine

# Copy built static files to Nginx public folder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
