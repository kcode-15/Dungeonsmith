---
name: Clerk SDK compatibility
description: Keep the Clerk browser SDK, its shared package, and React versions compatible in this pnpm workspace.
---

Keep `@clerk/react` and its resolved `@clerk/shared` dependency on compatible major generations. When Clerk exports are missing at dev-server startup, inspect the resolved package graph and update to a stable compatible SDK rather than patching internals.

**Why:** An older Clerk React release resolved a shared package without an export its bundle expected, causing the web workflow to fail during dependency optimization. The current Clerk shared peer range also excluded the workspace's previous React patch.

**How to apply:** Check the installed package versions and peer ranges before changing imports. Keep the workspace React version on a patch supported by the chosen Clerk release, then run the full typecheck and restart the web workflow.
