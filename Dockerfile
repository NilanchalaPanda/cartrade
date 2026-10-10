FROM node:20-bookworm-slim

WORKDIR /app/sdk

COPY sdk/package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY sdk/ ./
RUN mkdir -p /app/sdk/wallet && chown -R node:node /app/sdk

USER node
EXPOSE 4000

CMD ["node", "src/index.js"]
