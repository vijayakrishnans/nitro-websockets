// The site's name seam and what the page says about where it runs.
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_NAME } from "@web/shared/site";
import { site } from "@web/app/lib/site";
import { createIdentity } from "@web/server/utils/identity";

const web = path.resolve(__dirname, "../../../apps/web");
const read = (f: string) => readFileSync(path.join(web, f), "utf8");

describe("the site's name", () => {
  it("is one literal line in shared/site.ts, the line a bootstrap rewrites", () => {
    const lines = read("shared/site.ts").split("\n").filter((l) => l.includes("SITE_NAME ="));
    expect(lines).toEqual([`export const SITE_NAME = ${JSON.stringify(SITE_NAME)}`]);
    expect(site.name).toBe(SITE_NAME);
  });

  it("is what index.html's title and share card carry, through the build's placeholder", () => {
    const html = read("index.html");
    expect(html).toContain("<title>__SITE_NAME__</title>");
    expect(html).toContain('<meta property="og:title" content="__SITE_NAME__" />');
    expect(read("vite.config.ts")).toContain("html.replaceAll('__SITE_NAME__', escaped)");
  });
});

describe("the page", () => {
  it("names Cloudflare, not Vercel, as where it runs; the template's credit stays", () => {
    const html = read("index.html");
    const app = read("app/App.tsx");
    expect(html).not.toMatch(/vercel/i);
    expect(app).not.toMatch(/Vercel (Function|WebSockets)|Deploy with Vercel|VercelLogo/);
    expect(app).toContain("Realtime, served from a Durable Object");
    expect(site.repo).toBe("https://github.com/vercel/examples/tree/main/websockets/nitro");
    expect(site.docsUrl).toMatch(/^https:\/\/developers\.cloudflare\.com\/durable-objects\//);
  });
});

describe("an anonymous identity", () => {
  it("is a fresh id, an adjective-animal name and a cursor colour per connection", () => {
    const a = createIdentity();
    const b = createIdentity();
    expect(a.id).not.toBe(b.id);
    expect(a.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(a.color).toMatch(/^hsl\(\d{1,3} 85% 60%\)$/);
  });
});
