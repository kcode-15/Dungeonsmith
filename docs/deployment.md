# Deployment

Dungeonsmith uses three separate services with distinct roles:

- **GitHub Pages** hosts the static React/Vite frontend.
- **Render** hosts and runs the Express API. Render is the application/API host; it is not hosted on Enzonic.
- **Enzonic** hosts only the PostgreSQL database. The API running on Render connects to that database over TLS.

The API and database connection remain server-side. Never put the database connection string or Clerk secret key in frontend code, GitHub Pages settings, or any `VITE_*` variable.

## 1. Deploy the Express API on Render

Create a Render Web Service using this repository. Configure it to build from the repository root, because the API depends on shared pnpm workspace packages.

- Runtime: Node.js
- Node version: 24
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server build`
- Start command: `pnpm --filter @workspace/api-server start`
- Health check path: `/api/healthz`

The `render.yaml` file in the repository contains this service configuration. Select the branch you are deploying from when connecting the repository to Render.

In the Render service's Environment settings, configure:

- `DATABASE_URL`: paste the Enzonic PostgreSQL **pooler** connection URL into this server-side environment secret. Retain the required `sslmode=require` parameter. Do not commit the URL or paste it into chat.
- `CLERK_SECRET_KEY`: Clerk's secret key, stored only as a Render secret.
- `CLERK_PUBLISHABLE_KEY`: the matching publishable key, needed by the API's Clerk middleware.
- `CORS_ORIGINS`: comma-separated, exact frontend origins, including scheme and hostname but no path. For example, `https://kcode-15.github.io`.

Render runs the API; Enzonic does not run the API. The API uses the `DATABASE_URL` secret to connect to the Enzonic database. Use Enzonic's pooler host for the app's normal database traffic. Use the direct database host for migrations and long transactions. The first connection may take longer if the Enzonic branch is asleep. Check network access settings if Render cannot connect.

After deployment, verify `https://<your-render-service>.onrender.com/api/healthz`. Then test database-backed room operations. Free Render services may sleep and take longer to answer the first request after inactivity.

Do not automatically run `drizzle-kit push` against production. Review and apply production schema changes deliberately.

## 2. Configure and deploy the GitHub Pages frontend

1. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the publishing source.
2. Open **Settings → Secrets and variables → Actions → Variables** and add these public frontend build variables:
   - `VITE_API_BASE_URL`: the public Render API origin, e.g. `https://<your-render-service>.onrender.com` with no trailing slash.
   - `VITE_CLERK_PUBLISHABLE_KEY`: the Clerk publishable key. This is public and is included in browser assets.
   - `VITE_CLERK_PROXY_URL`: optional; set to `https://<your-render-service>.onrender.com/api/__clerk` only if you configure the Clerk proxy for that domain.
3. Do not add `DATABASE_URL` or `CLERK_SECRET_KEY` to GitHub variables or secrets used by the frontend build.
4. Push or merge the Pages workflow to `main`. It installs using `pnpm install --frozen-lockfile`, typechecks and builds the frontend, then deploys `artifacts/tabletop-rooms/dist/public`.

For this repository's default project Pages URL, the site is `https://kcode-15.github.io/Dungeonsmith/`, and the build base path is `/Dungeonsmith/`.

## 3. Check cross-origin sessions and authentication

The API uses HttpOnly player-session cookies. The default Pages origin and Render's `onrender.com` origin are different sites, so browser third-party-cookie restrictions may affect player sessions or Clerk authentication. The API must allow the exact frontend origin in `CORS_ORIGINS`, and browser API requests must include credentials.

For more reliable cookie behavior, use a custom frontend domain and an API hostname under the same registrable domain (for example, `play.example.com` and `api.example.com`). Configure those HTTPS origins in `CORS_ORIGINS`, GitHub Pages, Render, and Clerk as applicable. If using the default domains, test the full player join and sign-in flows in the browsers you intend to support.

## 4. Verify the deployment

Test the landing page, direct refresh of `/Dungeonsmith/room/<CODE>`, DM sign-in and dashboard, player room joins and cookies, map saves, chat, combat, and the API health endpoint.

## 5. Node and lockfile

The root `package.json` specifies pnpm `10.0.0` and Node `>=24`; Replit is configured for Node 24, and `pnpm-lock.yaml` uses lockfile format 9. The lockfile version alone does not establish a mismatch. The deployment workflow's `pnpm install --frozen-lockfile` verifies that the committed lockfile matches the workspace manifests. If it fails after dependency changes, regenerate and commit the lockfile with pnpm 10.0.0; do not edit the lockfile manually.
