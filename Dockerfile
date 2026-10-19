FROM node:26-slim

RUN npm install -g pnpm@11.25.0

RUN mkdir -p /app /data && chown -R node:node /app /data

WORKDIR /app

ENV AWB_HOME=/data \
    AWB_HOST=0.0.0.0 \
    AWB_PORT=4747

VOLUME /data
EXPOSE 4747

USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/server/package.json ./apps/server/
COPY --chown=node:node apps/web/package.json ./apps/web/
COPY --chown=node:node packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --prod

COPY --chown=node:node apps/server ./apps/server
COPY --chown=node:node packages/shared ./packages/shared

CMD ["node", "apps/server/bin/awb.js", "start"]
