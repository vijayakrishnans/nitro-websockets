# web-tests

The app's vitest suite (the room at /api/ws driven through crossws's own Cloudflare adapter over a stand-in Durable Object, across a simulated hibernation; the site's name seam; the page's text), run with pnpm test

The test suite for **web**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/web`          |
| Package      | `@app/web-tests`     |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
