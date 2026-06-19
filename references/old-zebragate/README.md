# ZebraGate

ZebraGate is a pnpm workspace MVP scaffold for a website, API server, and Windows desktop client.

## Apps

- `apps/web`: Next.js + Tailwind website, dashboard, and admin placeholders
- `apps/api`: Fastify API server with mock OpenAI-compatible endpoints
- `apps/desktop`: Tauri 2 + React + Vite Windows desktop shell

## Packages

- `packages/shared`: shared types, enums, constants, and mock data
- `packages/db`: Supabase SQL migration and database-facing types
- `packages/config`: shared config helpers

## Quick Start

```bash
pnpm install
pnpm dev:web
pnpm dev:api
pnpm dev:desktop
```

See `docs/` for architecture, API, schema, and MVP scope notes.
