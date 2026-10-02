FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# npm can silently skip a failed optional native-package download. Verify the
# build's required Tailwind binding before caching this dependency layer.
RUN npm ci --include=optional && node -e "require('@tailwindcss/oxide'); require('@tailwindcss/postcss')"
COPY . .
# These placeholders are only used while Next.js collects route metadata.
# Runtime credentials come from the deployment environment.
RUN BETTER_AUTH_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET=build-only-placeholder-at-least-32-characters \
    GOOGLE_CLIENT_ID=build-only-client-id \
    GOOGLE_CLIENT_SECRET=build-only-client-secret \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
