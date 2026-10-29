# Dungeonsmith

Dungeonsmith is an online D&D table where DMs build shared maps and players join by room code to chat without needing accounts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/tabletop-rooms run dev` — run the web app through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/tabletop-rooms/` — Dungeonsmith landing/join flow, DM dashboard, room map editor, and chat UI
- `artifacts/api-server/src/routes/tabletop.ts` — room, player join, map, and chat API
- `lib/db/src/schema/tabletop.ts` — PostgreSQL room, player-session, and message tables
- `lib/api-spec/openapi.yaml` — API contract used to generate client hooks and server validation schemas

## Architecture decisions

- Clerk accounts are for DMs; players enter a room code and character name without signing up.
- Player sessions use room-scoped, HttpOnly cookies; only hashes of the session tokens are stored.
- Room maps are saved as JSONB and shared state refreshes through short polling intervals.

## Product

- DMs can create campaign rooms, share a short join code, and paint a terrain grid.
- Players join with a character name, view the shared map, and send messages in room chat.
- DMs can edit maps and participate in room chat from their signed-in account.

## User preferences

- Only the DM needs an account; player accounts are optional and not required to join or chat.

## Gotchas

- API requests are served under `/api`; the web app is mounted at `/`.
- After editing `lib/api-spec/openapi.yaml`, regenerate API hooks and Zod schemas before changing route/client code.
- Push development schema changes with `pnpm --filter @workspace/db run push`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
