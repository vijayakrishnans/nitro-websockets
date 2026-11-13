import { defineHandler } from 'nitro'

// Workers Static Assets answers every file the build wrote before the Worker
// runs, so a request that reaches the app for a path naming a file (a dot in
// its last segment, outside /api) is a file nobody has: answer 404, not the
// single-page app's index.html (the template's renderer answers every other
// unmatched path with it, as on Vercel). A stale or mistyped /assets/*.js then
// fails loudly instead of loading HTML as a script.
export default defineHandler((event) => {
  const path = event.url.pathname
  const last = path.slice(path.lastIndexOf('/') + 1)
  if (!path.startsWith('/api/') && last.includes('.')) {
    event.res.status = 404
    return 'Not found'
  }
  return undefined
})
