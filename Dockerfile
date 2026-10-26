# ==========================================
# 1. Build Stage
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency files first to leverage Docker layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies needed for building)
RUN npm install

# Copy application source
COPY . .

# Compile TypeScript to JavaScript in /dist
RUN npm run build

# ==========================================
# 2. Production Runtime Stage
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy package manifests
COPY package*.json ./

# Install only production dependencies for a smaller, leaner image
RUN npm install --omit=dev

# Copy compiled artifacts from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Document the port the app listens on
EXPOSE 3000

# Start production server
CMD ["node", "dist/main.js"]