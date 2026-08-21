# nginx/Dockerfile
#
# Task 39.3. DECISION (see DECISIONS.md, "Task 39: client served by
# Nginx, not its own container"): the client is NOT a separate running
# service. It's a static Vite build (`vite build` -> dist/), which has
# no server-side process of its own once built — running it behind a
# dedicated Node/serve container would just be a second static file
# server for no reason when Nginx is already sitting in front of
# everything as the reverse proxy. This image does both jobs: stage 1
# builds the client, stage 2 serves the built dist/ AND proxies /api/*
# through to the `api` service on Docker's internal network.
#
# VITE_API_BASE_URL is a Vite BUILD-TIME env var (baked into the JS
# bundle at build, not read at runtime — see client/src/api/axios.js)
# so it must be passed as a build ARG, not a docker-compose runtime
# `environment:` entry, which would silently have no effect here.

FROM node:20-alpine AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci
COPY client/ .

# Browser-facing URL — goes through THIS Nginx container's own /api
# proxy (see nginx.conf), not a direct container-to-container address,
# since the browser runs outside Docker's internal network.
ARG VITE_API_BASE_URL=http://localhost/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80