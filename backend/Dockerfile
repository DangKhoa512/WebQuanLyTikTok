FROM node:20-alpine

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

# Create logs directory
RUN mkdir -p logs

EXPOSE 3000

CMD ["node", "src/server.js"]
