// The site's name, written once: the page's <title> and its share-card title
// (index.html, through vite.config.ts), and what GET /api/health answers with,
// so a deploy's smoke and an operator's curl both see which site answered. The
// Orun bootstrap that creates a product rewrites it to that product's name, as
// a JSON string, so keep it literal and on one line.
export const SITE_NAME = "Nitro Websockets"
