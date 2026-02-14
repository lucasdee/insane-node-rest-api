# insane-node-rest-api

A compact, fully-typed REST API starter using Node.js, TypeScript, Express, Prisma (MySQL/MariaDB), and tsoa for OpenAPI generation.

## Features

- TypeScript + Express server
- Prisma ORM with generated client
- OpenAPI (Swagger) generation via `tsoa`
- JWT authentication and basic user controller
- ESLint, Prettier and Vitest for linting, formatting and tests

## Prerequisites

- Node.js >= 24
- A MySQL or MariaDB instance with two databases (main & shadow) accessible from your environment
- npm (or a compatible package manager)

## Environment

Create a `.env` file in the project root with the following values:

```
PORT=3000
JWT_SECRET=your_jwt_secret
DATABASE_USER=your_db_user
DATABASE_PASSWORD=your_db_password
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=your_db_name
SHADOW_DATABASE_NAME=your_shadow_db_name
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

## Database Migrations

During development run:

```bash
npx prisma migrate dev --name init
```

For production deploy migrations with:

```bash
npx prisma migrate deploy
```

## Development

Run the development server with hot reload:

```bash
npm run dev
```

Build the project (generates routes/spec via `tsoa` then TypeScript compile):

```bash
npm run build
```

Start the compiled app:

```bash
npm run start
```

## OpenAPI / Swagger

Generate the OpenAPI spec and routes (this is already part of `build`):

```bash
npm run tsoa:spec
npm run tsoa:routes
```

The generated spec is available at `src/docs/swagger.json` and an Express route serves Swagger UI in the running app.

## Testing

Run tests with:

```bash
npm test
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
- Add CI steps to run lint, tests and generate Prisma client during CI builds.

## License

MIT
