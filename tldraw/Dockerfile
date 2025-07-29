FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json .

# Install dependencies (this layer will be cached if package.json doesn't change)
RUN npm install

# Copy application files (these change more frequently)
COPY index.html .
COPY main.jsx .
COPY vite.config.js .

EXPOSE 3000

CMD ["npm", "run", "dev"] 