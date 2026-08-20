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

# Install root deps (React runtime, Capacitor core)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Install SERVER deps (express, better-sqlite3, cors, dotenv)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# Copy the built frontend + server source
COPY --from=build /app/dist ./dist
COPY server/src/ ./server/src/
COPY capacitor.config.json ./

ENV HOST=0.0.0.0
# Don't set PORT here — Railway injects its own PORT at runtime.
EXPOSE 8787
CMD ["npm", "run", "start:prod"]
