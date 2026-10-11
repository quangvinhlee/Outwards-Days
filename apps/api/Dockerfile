FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/planner/package.json packages/planner/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api/src apps/api/src
COPY packages packages
RUN pnpm build
ENV NODE_ENV=production
USER node
EXPOSE 10000
CMD ["node", "dist/apps/api/src/server.js"]
