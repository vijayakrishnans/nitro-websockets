# nitro-websockets

A realtime room on one **Cloudflare Worker**: everyone on the page sees each
other's cursors live, with a presence bar and emoji reactions, over a single
WebSocket. The page is a [Nitro v3](https://nitro.build/) + React app built by
Vite; every WebSocket upgrade to `/api/ws` goes to one **Durable Object**, the
room, which holds each connection as a hibernatable WebSocket — so a quiet
room costs nothing while its sockets stay open. Every merge to `main` deploys
it to stage, then prod.

Built from Vercel's Nitro + WebSockets Starter (vercel/examples, MIT — the
licence is `apps/web/LICENSE.md`).

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace and the secrets the app uses into
[ai/context/deployment.md](ai/context/deployment.md); how the app deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## Routes

| Route | Answers |
|---|---|
| `GET /` (and any other page path) | the app: `index.html`, titled with the site's name (`SITE_NAME`), and its script from `/assets/` |
| `WS /api/ws` | the room: `welcome` (you and everyone already here), then `join`, `leave`, `cursor` and `reaction` frames from the others, and `pong` to your `ping` (`apps/web/shared/types/realtime.ts`) |
| `GET /api/health` | `{"status":"ok","name":"<SITE_NAME>","environment":"<env>"}` — what the deploy's smoke and an operator's probe read |
| a missing file (`/assets/old.js`, `/x.png`) | `404` |

## What is here

| Surface | Where |
|---|---|
| The page — cursors, presence bar, reactions | `apps/web/app/` (`App.tsx`; the connection, reconnect and heartbeat in `apps/web/app/hooks/use-realtime.ts`) |
| The room | `apps/web/server/api/ws.ts` |
| Each connection's identity, kept with its socket | `apps/web/server/utils/presence.ts` |
| The wire protocol | `apps/web/shared/types/realtime.ts` |
| The site's name (the page's title and share card, and `/api/health`) | `apps/web/shared/site.ts` |
| Nitro's config (the `cloudflare_durable` preset, WebSockets on) | `apps/web/vite.config.ts` |
| Worker config (name, compatibility date, the room's Durable Object and its migration, the build output as the Worker and its Static Assets, per-environment vars) | `apps/web/wrangler.jsonc` |
| Deploy contract | `apps/web/component.yaml` (`cloudflare-worker-turbo`) |
| Tests | `tests/web` (vitest: the room driven through crossws's own Cloudflare adapter over a stand-in Durable Object, a hibernation included) |

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build            # vite build → apps/web/.output (the Worker and the page's assets)
```

Run it with Vite's dev server (Node), or the built Worker under workerd with
its Durable Object, and open it in two tabs:

```bash
pnpm --filter @app/web dev                 # vite dev, http://localhost:3000
pnpm --filter @app/web preview             # wrangler dev over the build, http://localhost:8787
curl http://localhost:8787/api/health      # {"status":"ok",…,"environment":"local"}
```

## How the room keeps its state

There is one room, one Durable Object (Nitro's preset names the class and its
binding `$DurableObject`). When nobody has said anything for a while the
runtime evicts it and keeps only the open sockets; the next message wakes it.
A wake loses module memory and each peer's `context`, so nothing the room
needs may live there: each connection's identity is written into its socket's
serialized attachment (`rememberIdentity` in `server/utils/presence.ts`), and
the roster is read from the room's live sockets (`othersOf`). Keep that rule
when you add to the room — give an authenticated user's id to
`rememberIdentity` in place of `createIdentity()`, and read it back with
`recallIdentity`, not from a module variable.

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. The app deploys to `stage`, then to
`prod` once stage has converged on the same commit; `dev` only verifies. The
Worker is `nitro-websockets-web-<env>` on your account's workers.dev subdomain, and
every deploy is smoke-tested: `/api/health` must answer `"status":"ok"` for that
environment, and `/api/ws` must answer a WebSocket handshake with `101` (the
smoke's connection is dropped after 3 seconds, so anyone on the page may see a
passer-by join and leave). A pull request runs the same pipeline's verify lanes:
the Worker built, type-checked and dry-deployed for each environment, with
nothing deployed. They do not lint or run the tests, so run `pnpm typecheck`,
`pnpm lint` and `pnpm test` before you push. (A push to `main` builds,
deploys and smoke-tests.)

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare token and account id are brokered per run from the workspace's
Cloudflare connection; nothing provider-shaped is stored in the repository
or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after rotating a
secret, say. A component with nothing to run in that environment (a test
suite in `prod`) is left out with a notice.

## Adding a binding or a secret

The Worker binds the room's Durable Object (declared by class, created by the
deploy from the migration in `wrangler.jsonc`) and nothing that needs a
resource id, so `wrangler.jsonc` is committed as it deploys. To give it a KV
namespace, a D1 database or an R2 bucket, add the resource under `infra/` as
its own component and have `apps/web/component.yaml` depend on it;
`tooling/wire/` renders a wrangler template from the ids that component
publishes. A binding goes in every `env` block too: wrangler does not inherit
bindings into an environment. A runtime secret (an API key for a service the
app calls) is an Orun secret: `orun secrets set <KEY> --org <ws> --env <env>`,
declared in the component's `optionalSecretEnv` and named in its
`runtimeSecrets`, then pushed to the Worker after each deploy. Until it is set,
the route that needs it should say so rather than fail. In a route a request's
bindings are `event.req.runtime.cloudflare.env` (as `/api/health` reads
`ENVIRONMENT`).

## Custom domain

The app answers on workers.dev from its first deploy. To serve it on your own
domain, add the domain to the Cloudflare account the app deploys into and
attach it to the Worker (dashboard → Workers & Pages → `nitro-websockets-web-prod` →
Settings → Domains & Routes → Add → Custom domain); do the same for stage
with a subdomain if you want one. The workers.dev URL keeps answering, and the
deploy's smoke keeps reading it — unless the environment sets `DEPLOYED_URL`
in `intent.yaml`, which the smoke reads instead:

```yaml
environments:
  prod:
    env:
      DEPLOYED_URL: https://nitro-websockets.example.com
```

The repository names the domain in one place, `BASE_DOMAIN` in `intent.yaml`
(one line per environment), which the app was born with as the reserved
placeholder `nitro-websockets.example.com` — the example above carries it too.
Replace it with your domain in the same change that attaches it.
