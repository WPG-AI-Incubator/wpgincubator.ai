# The site has no runtime dependencies: the image is Node plus these files.
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY content ./content
COPY public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server.js"]
