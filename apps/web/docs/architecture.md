# web — architecture

Built by the turbo pipeline from `apps/web` and deployed with wrangler.

|                     |                              |
| ------------------- | ---------------------------- |
| Worker config       | `apps/web/wrangler.jsonc`    |
| Entry               | `./.output/server/index.mjs` |
| Compatibility date  | `2026-10-01`                 |
| Compatibility flags | `nodejs_compat`              |

## Bindings

| Binding          | Kind           | Source                 |
| ---------------- | -------------- | ---------------------- |
| `$DurableObject` | Durable Object | class `$DurableObject` |
| `ASSETS`         | Static assets  | `./.output/public`     |

## Variables

`ENVIRONMENT` — overridden per environment (`dev`, `prod`, `stage`).
