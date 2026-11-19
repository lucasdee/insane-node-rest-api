# insane-node-rest-api

A compact, fully-typed REST API starter using Node.js, TypeScript, Express, Prisma (MySQL/MariaDB), and tsoa for OpenAPI generation.

## Features

- TypeScript + Express server
- Prisma ORM with generated client
- OpenAPI (Swagger) generation via `tsoa`
- JWT authentication with refresh tokens and basic user controller
- ESLint, Prettier and Vitest for linting, formatting and tests

## Prerequisites

- Node.js >= 24
- A MySQL or MariaDB instance with two databases (main & shadow) accessible from your environment
- npm (or a compatible package manager)

## Environment

Create a `.env` file in the project root with the following values:

```
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=super-secret
JWT_REFRESH_SECRET=super-refresh-secret
JWT_REFRESH_HASH_SECRET=super-refresh-hash-secret
JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES=5
JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS=7
DATABASE_USER=db_user
DATABASE_PASSWORD=db_password
DATABASE_NAME=db_name
DATABASE_HOST=db_host
DATABASE_PORT=db_port
SHADOW_DATABASE_NAME=shadow_db_name
```

## Install

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

Generate the OpenAPI spec:

```bash
npm run tsoa:spec
```

Generate the OpenAPI routes:

```bash
npm run tsoa:routes
```

## Database Migrations

Migrations live in `prisma/migrations` and are committed. Apply them to a new or existing database with:

```bash
npx prisma migrate deploy
```

After changing `prisma/schema.prisma`, create and apply a new migration during development (this uses the shadow database), then commit it:

```bash
npx prisma migrate dev --name <describe-the-change>
```

Never edit a migration that has already been applied somewhere: Prisma stores a checksum of each one and reports a mismatch.

## Development

Run the development server with hot reload:

```bash
npm run dev
```

## Production

Build the project (generates routes/spec via `tsoa` then TypeScript compile):

```bash
npm run build
```

Start the compiled app:

```bash
npm run start
```

## Logging

Requests are logged in Apache `combined` format to `access.log`, rotated daily, in the `logs` folder of the working directory. Set `ACCESS_LOG_DIR` to use another folder (a relative path is resolved against the working directory). File logging is off when `NODE_ENV=test`, unless `ACCESS_LOG_ENABLED=true` is set; `ACCESS_LOG_ENABLED=false` turns it off in any environment.

Outside production and tests, requests are also logged to the console in a short, colored format.

## Health Checks & Shutdown

For load balancers and orchestrators, without auth and not in the access log:

- `GET /health` (liveness): `200 {"status":"ok"}` while the process is running. It doesn't touch the database.
- `GET /health/ready` (readiness): `200 {"status":"ok"}` when the database answers, `503 {"status":"unavailable"}` when it doesn't.

On `SIGTERM` or `SIGINT` the server stops accepting connections, lets requests in progress finish, closes the database pool and exits. If that takes longer than 10 seconds, or a second signal arrives, it exits right away with code 1.

## OpenAPI / Swagger

Generate the OpenAPI spec and routes (this is already part of `build`):

```bash
npm run tsoa:spec
npm run tsoa:routes
```

The generated spec is available at `src/docs/swagger.json`, and the running app serves Swagger UI at `/docs`. It is off when `NODE_ENV=production`, unless `DOCS_ENABLED=true` is set; `DOCS_ENABLED=false` turns it off in any environment.

## API Types

Generate TypeScript types for the API:

```bash
npm run types:generate
```

The generated file will be available at `generated/api.ts`

## Testing

Run tests with:

```bash
npm run test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Lint & Format Code

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:fix
```

## Notes & Next Steps

- Check `src/config/env.ts` for required environment variables.
- Add or update API controllers in `src/controllers` and DTOs in `src/dtos`.
- CI (`.github/workflows/ci.yml`) fails on high or critical `npm audit` advisories, builds the project, checks that the committed `swagger.json` and `routes.ts` match what tsoa generates, and runs lint, the Prettier check, a type check including tests, and the tests with coverage, on pushes to `main` and on pull requests.

## License

MIT
