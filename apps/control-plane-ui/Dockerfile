ARG IMAGE_VERSION

FROM node:24-alpine AS build
ARG IMAGE_VERSION
ENV IMAGE_VERSION="${IMAGE_VERSION}"
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY apps/catalog-ui/package.json ./apps/catalog-ui/package.json
COPY apps/control-plane-ui/package.json ./apps/control-plane-ui/package.json
RUN npm ci
COPY packages/design-system ./packages/design-system
COPY apps/control-plane-ui ./apps/control-plane-ui
RUN npm run build --workspace @daca/control-plane-ui

FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG IMAGE_VERSION
ENV IMAGE_VERSION="${IMAGE_VERSION}"
LABEL org.opencontainers.image.version="${IMAGE_VERSION}"
COPY apps/control-plane-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/control-plane-ui/dist/control-plane-ui/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
