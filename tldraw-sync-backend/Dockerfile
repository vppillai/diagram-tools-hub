FROM node:20-alpine

WORKDIR /app

# Install wget for health check
RUN apk add --no-cache wget

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY server.js ./

# Create directories for data persistence
RUN mkdir -p ./.rooms ./.assets

# Internal port only - accessed via nginx proxy
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:3001/health || exit 1

# Start server
CMD ["npm", "start"]