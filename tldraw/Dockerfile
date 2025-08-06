FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json .

# Install dependencies (this layer will be cached if package.json doesn't change)
RUN npm install

# Copy application files (these change more frequently)
COPY index.html .
COPY src/ src/
COPY vite.config.js .

# Build argument to control build mode
ARG BUILD_MODE=production


# Conditionally build for production if BUILD_MODE is production
RUN if [ "$BUILD_MODE" = "production" ]; then \
        npm run build && npm install -g serve; \
    fi

EXPOSE 3000

# Use a script to determine which command to run based on BUILD_MODE
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

CMD ["docker-entrypoint.sh"] 