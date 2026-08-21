# server/Dockerfile
#
# Task 39.1/39.2. One image, two roles: docker-compose.yml runs this
# same image as both the `api` service (default CMD below) and the
# `worker` service (command override: `node worker.js`). Deliberately
# not two separate Dockerfiles — api and worker share the exact same
# dependency tree and source (see worker.js's own header comment: it's
# a separate *process*, not a separate codebase), so building the same
# layer twice would just double build time and image storage for zero
# benefit. See DECISIONS.md, "Task 39: shared API/worker image."

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app

# Non-root user — alpine's node image ships a `node` user/group
# already (uid 1000), no need to create one.
RUN chown -R node:node /app
USER node

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

ENV NODE_ENV=production

EXPOSE 5000

# Default role: API server. docker-compose.yml overrides this command
# for the `worker` service.
CMD ["node", "server.js"]