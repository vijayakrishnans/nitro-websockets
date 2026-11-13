import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { nitro } from 'nitro/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { SITE_NAME } from './shared/site'

/** Writes the site's name into index.html's title and share card (HTML-escaped). */
function siteName(): Plugin {
  const escaped = SITE_NAME.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return {
    name: 'site-name',
    transformIndexHtml: html => html.replaceAll('__SITE_NAME__', escaped),
  }
}

export default defineConfig({
  plugins: [
    // Nitro v3 powers the server. `features.websocket` enables native crossws
    // support, which works the same in local dev and on Workers: the
    // cloudflare_durable preset sends every WebSocket upgrade to one Durable
    // Object, where crossws's Cloudflare adapter accepts it as a hibernatable
    // socket and runs pub/sub across the room, so a single
    // `defineWebSocketHandler` handles every environment. `vite dev` stays on
    // Node; the preset applies to `vite build`.
    nitro({
      serverDir: './server',
      preset: 'cloudflare_durable',
      compatibilityDate: '2026-10-01',
      // The committed wrangler.jsonc is the one config a deploy reads (Nitro
      // writes none beside it). The output imports node: builtins, which the
      // Worker's nodejs_compat flag provides.
      cloudflare: { deployConfig: false, nodeCompat: true },
      features: {
        websocket: true,
      },
    }),
    react(),
    tailwindcss(),
    siteName(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
})
