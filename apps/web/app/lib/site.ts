import { SITE_NAME } from '../../shared/site'

/** Site-level metadata shared across the UI. */
export const site = {
  name: SITE_NAME,
  description:
    'A minimal Nitro v3 + React starter on Cloudflare Workers. Live cursors, presence, and reactions over a single realtime connection — every connection a hibernatable WebSocket in one Durable Object.',
  /** The template this site was built from (its credit, in the footer). */
  repo: 'https://github.com/vercel/examples/tree/main/websockets/nitro',
  /** How the room works on Cloudflare: WebSockets on a Durable Object, hibernation included. */
  docsUrl: 'https://developers.cloudflare.com/durable-objects/best-practices/websockets/',
}
