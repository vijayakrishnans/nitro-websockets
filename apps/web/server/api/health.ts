import { defineHandler } from 'nitro'
import { SITE_NAME } from '../../shared/site'

// The deploy's contract (the port's; the template has only the page and
// /api/ws): the site's name and the environment whose config the Worker runs —
// wrangler's `env.<name>.vars.ENVIRONMENT`, which Nitro's Cloudflare presets
// hand every request as `event.req.runtime.cloudflare.env` — so a 200 here is
// this site, deployed to that environment. `process.env` is the fallback for
// Node (`vite dev`).
export default defineHandler((event) => {
  const runtime = (event.req as { runtime?: { cloudflare?: { env?: Record<string, unknown> } } }).runtime
  const environment = runtime?.cloudflare?.env?.ENVIRONMENT ?? process.env.ENVIRONMENT ?? 'unknown'
  return { status: 'ok', name: SITE_NAME, environment }
})
