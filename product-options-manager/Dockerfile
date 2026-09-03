FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run prisma -- generate && npm run build && npm prune --omit=dev

CMD ["npm", "run", "docker-start"]
