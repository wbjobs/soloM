FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm install && npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY --from=builder /app/dist ./dist
RUN npm install --omit=dev
EXPOSE 4000
CMD ["node", "dist/index.js"]
