# Build stage: compile frontend
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: serve API + static frontend
FROM node:20-slim AS runtime
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server/ ./server/
COPY capacitor.config.json ./

ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
CMD ["npm", "run", "start:prod"]
