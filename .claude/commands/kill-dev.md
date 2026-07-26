---
description: Kill all local dev environment processes for The Pub Market (web, api, pitch)
---

Stop every local dev process for this project: `next dev` (apps/web, :3000), `wrangler dev` for apps/api (:8787, inspector :9229) and apps/pitch (:8788, inspector :9230), and any orphaned `turbo run dev` / `workerd` processes from this repo.

Run `scripts/kill-dev.sh` via the Bash tool and report its output to the user. Do not ask for confirmation — this only kills local processes on this machine, nothing remote or destructive to data.
