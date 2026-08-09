FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and install dependencies
COPY server/package*.json ./
RUN npm install --production

# Copy server source
COPY server/ ./

ENV NODE_ENV=production
EXPOSE 3000

# Default command runs the server; override in docker-compose for worker
CMD ["node", "index.js"]
