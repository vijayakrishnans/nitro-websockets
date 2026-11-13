// What crossws's Cloudflare adapter imports from the Workers runtime: `env`,
// which it falls back to only when a request brings none. The tests hand the
// adapter their own Durable Object, so this stays empty.
export const env: Record<string, unknown> = {};
