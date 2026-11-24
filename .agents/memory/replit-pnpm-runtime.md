---
name: Replit pnpm version mismatch
description: Work around a Replit system pnpm that crashes while trying to auto-install the packageManager-pinned version.
---

When Replit's system pnpm is newer than the version declared by the workspace, its automatic version switch can abort while bootstrapping the pinned CLI. The workspace can disable that auto-bootstrap for managed Replit workflows while CI continues to install the exact pinned version; use `corepack pnpm` for shell commands that must match the pin.

**Why:** Replit's managed web and API workflows failed while their pnpm executable tried to install the workspace's pinned version, but Corepack could run that version successfully.

**How to apply:** Check the root `packageManager` value and `pnpm --version`. If automatic bootstrapping aborts, disable `manage-package-manager-versions` in the workspace `.npmrc`, restart the artifact workflows, and use Corepack for reproducible validation.
