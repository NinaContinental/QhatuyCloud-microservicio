FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "src/server.js"]
