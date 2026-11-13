# nitro-websockets — operating contract (for humans and agents)

This is the standing guide to how this app is deployed and operated.
Instance facts (live URLs, workspace, the secrets it uses) live in
[deployment.md](deployment.md), rendered from probed reality by the
bootstrap's `02-docs` phase; this file is the contract that stays true
between deployments. It is written to give an agent with repository read
access enough context to reason about and operate the app without any other
source.

## What this system is

A realtime room on Cloudflare alone, expressed as an Orun component-native
desired-state repo.

- **`apps/web`** — the app: a Nitro v3 + React page and its room, built by
  Vite and Nitro's own `cloudflare_durable` preset (`vite.config.ts`) into one
  Cloudflare Worker (`cloudflare-worker-turbo`): `.output/server/index.mjs` is
  the Worker and `.output/public` the page's Workers Static Assets, which the
  committed `wrangler.jsonc` names. `GET /` and every other page path answer
  the app; `WS /api/ws` is the room; `GET /api/health` answers
  `{"status":"ok","name":…,"environment":…}` (the environment read from the
  request's bindings); a missing file is a 404. The Worker sends every
  WebSocket upgrade to ONE Durable Object, the room (class and binding
  `$DurableObject`, the preset's names), which holds each connection as a
  hibernatable WebSocket. That object is created by the first deploy from the
  migration in `wrangler.jsonc`; nothing else is bound, and the app holds no
  runtime secret.
- **`tests/web`** — vitest driving the room through crossws's own Cloudflare
  adapter over a stand-in Durable Object (a hibernation included), the name
  seam and the page's text.
  A pull request's lanes do not run it (its `quick-check` lane on `dev`
  installs and checks the package; the Worker's lanes build, type-check and
  dry-deploy it): run `pnpm typecheck`, `pnpm lint` and `pnpm test` before
  you push.
- **`tooling/*`** — shared TypeScript and ESLint configuration, and the
  deploy-time wrangler renderer for workers that take wiring.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build, type-check and dry-run the deploy,
nothing deploys.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. Each deploy lane installs the workspace, checks the Worker's structure
   (`package.json` and the committed `wrangler.jsonc`), builds and
   typechecks it, runs `wrangler deploy --env <env>` — the Worker is
   `nitro-websockets-web-<env>` — and smoke-tests it: `/api/health` on its workers.dev URL
   must answer `"status":"ok"` for that environment, and `/api/ws` a WebSocket
   handshake with `101` (held for 3 seconds: anyone on the page sees a
   passer-by join and leave).
4. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
5. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "app
  converged"; probe `/api/health` instead.
- A change to `intent.yaml`'s `environments` maps to no component and
  redeploys nothing on its own. Land it with a change under `apps/web`.

## Secrets model

- **Brokered provider secrets**: `CLOUDFLARE_API_TOKEN` (Workers deploy
  scope) and `CLOUDFLARE_ACCOUNT_ID` — pointers minted per run from the
  workspace's Cloudflare connection. No long-lived values at rest; nothing
  to rotate by hand.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.
- The app needs no runtime secret. One it comes to need (a key for a service
  it calls) is set with `orun secrets set <KEY> --org <ws> --env <env>`,
  declared in `apps/web/component.yaml`'s `optionalSecretEnv` and named in
  its `runtimeSecrets` parameter, and pushed to the Worker after each deploy;
  until it is set, the route that needs it should answer that it is not
  configured rather than fail.

## Verifying the system

```bash
# the app on each environment (also recorded, probed, in deployment.md)
curl -s https://nitro-websockets-web-stage.vijayakrishnan12994.workers.dev/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://nitro-websockets-web-prod.vijayakrishnan12994.workers.dev/

# workspace readiness (integrations + repository link)
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| add a message to the room | a new `t` in `apps/web/shared/types/realtime.ts`, a `case` in `apps/web/server/api/ws.ts` (read the sender with `recallIdentity`, never a module variable: the room hibernates), the client in `apps/web/app/hooks/use-realtime.ts`, a test in `tests/web`, merge |
| add a server route | a file under `apps/web/server/api/` exporting `defineHandler(...)` (`hello.ts` → `/api/hello`), merge |
| add a static file | `apps/web/public/` — `vite build` copies it into `.output/public`, which Workers Static Assets serves before the Worker runs |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| rename the app | `SITE_NAME` in `apps/web/shared/site.ts` — the page's title and share card, and what `/api/health` answers with |
| serve a custom domain | attach it to the Worker in Cloudflare (README, "Custom domain"), then replace the placeholder `nitro-websockets.example.com` in `intent.yaml`'s `BASE_DOMAIN` (every environment) with it; the workers.dev URL keeps answering for the smoke |
| add a runtime secret | `orun secrets set <KEY> --org <ws> --env <env>`, then declare it in the component's `optionalSecretEnv` and name it in `runtimeSecrets` |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase) re-probes the URLs and re-renders
[deployment.md](deployment.md); it is idempotent.

## Evolution

Structural changes (a second Worker, a data store, a queue) follow the same
contract that deployed the app: add a component under `apps/`, `infra/` or
`packages/` with a `component.yaml`, land it as a pull request, and the
convergence run applies it. A Worker that reads an infra component's wiring
declares `dependsOn` on it, `mode: enforced` on `github-push-main`, so one
convergence applies the infra first.
