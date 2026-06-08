FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cloud Run / most PaaS inject PORT; server.js honours it (default 4000 locally).
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]
