FROM node:18-alpine

WORKDIR /app

# Copy application files
COPY package.json .
COPY index.html .
COPY main.jsx .
COPY vite.config.js .

# Install dependencies
RUN npm install

EXPOSE 3000

CMD ["npm", "run", "dev"] 