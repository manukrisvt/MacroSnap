# Build stage: compile frontend
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Runtime stage: serve API + static frontend
FROM node:20-slim AS runtime
WORKDIR /app

# Install ALL deps (root package.json now includes server deps too)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the built frontend + server source
COPY --from=build /app/dist ./dist
COPY server/src/ ./server/src/
COPY capacitor.config.json ./

ENV HOST=0.0.0.0
# Don't set PORT here — Railway injects its own PORT at runtime.
EXPOSE 8787
CMD ["npm", "run", "start:prod"]
