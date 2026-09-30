FROM node:20-alpine

# Selenium uses the system Chromium browser and matching driver.
RUN apk add --no-cache chromium chromium-chromedriver
ENV CHROME_BIN=/usr/bin/chromium-browser CHROMEDRIVER_PATH=/usr/bin/chromedriver

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
