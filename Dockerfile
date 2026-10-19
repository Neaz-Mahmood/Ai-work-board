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

# Only the server and its workspace deps; drop pnpm's cache and store in the same layer.
RUN pnpm install --frozen-lockfile --prod --filter @awb/server... \
    && rm -rf /home/node/.cache/pnpm /home/node/.local/share/pnpm

COPY --chown=node:node apps/server ./apps/server
COPY --chown=node:node packages/shared ./packages/shared

CMD ["node", "apps/server/bin/awb.js", "start"]
