# Deployment

Dungeonsmith is deployed as two services:

- GitHub Pages serves the static React frontend.
- Render runs the Express API.
- Enzonic PostgreSQL stores rooms, players, map state, and chat.

## Backend secrets

Configure these values only in Render's Environment settings:

- `DATABASE_URL`: Enzonic pooler URL, including `sslmode=require`.
- `CLERK_SECRET_KEY`: Clerk secret key.
- `CLERK_PUBLISHABLE_KEY`: matching Clerk publishable key.
- `CORS_ORIGINS`: exact frontend HTTPS origins, separated by commas.

Example:

```text
CORS_ORIGINS=https://kcode-15.github.io
```

Never add `DATABASE_URL` or `CLERK_SECRET_KEY` to GitHub Actions variables, GitHub repository files, or `VITE_*` variables.

## Deploy the API

1. Create a Render Web Service from this repository.
2. Select the deployment branch while testing.
3. Let Render use `render.yaml`, or configure:
   - Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server build`
   - Start: `pnpm --filter @workspace/api-server start`
   - Health check: `/api/healthz`
4. Add the secrets above.
5. Verify `https://<render-host>/api/healthz`.

Use the Enzonic **pooler** host for the API. Use the direct host for migrations and long-running transactions.

Do not automatically run `drizzle-kit push` in production.

## Configure GitHub Pages

In the repository settings:

1. Open **Settings → Pages**.
2. Set the source to **GitHub Actions**.
3. Open **Settings → Secrets and variables → Actions → Variables**.
4. Add:
   - `VITE_API_BASE_URL=https://<render-host>`
   - `VITE_CLERK_PUBLISHABLE_KEY=<publishable key>`
   - `VITE_CLERK_PROXY_URL=https://<render-host>/api/__clerk` if proxy authentication is configured.

`VITE_CLERK_PUBLISHABLE_KEY` is public and belongs in browser code. `CLERK_SECRET_KEY` must never be in GitHub Actions variables.

Push or merge the deployment branch into `main`. The workflow deploys:

```text
artifacts/tabletop-rooms/dist/public
```

to:

```text
https://kcode-15.github.io/Dungeonsmith/
```

## Verify

Test:

- Landing page
- Room joins
- DM sign-in and dashboard
- Direct refresh of `/Dungeonsmith/room/<CODE>`
- Player cookies
- Map saves
- Chat
- Combat
- Health endpoint

For more reliable cross-origin player cookies and Clerk sessions, use a custom frontend domain plus an API subdomain. The GitHub Pages default domain and a separate Render domain are cross-site origins and may have browser third-party-cookie restrictions.
