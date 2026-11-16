FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV PORT=8080 SEARCH_NODES=3200 NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "src/server.mjs"]
