import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "../../apps/web"),
      // crossws's Cloudflare adapter reads `env` from the Workers runtime
      // module; on Node the tests hand it a stub.
      "cloudflare:workers": path.resolve(__dirname, "src/stubs/cloudflare-workers.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Transform crossws rather than load it from node_modules as is, so its
    // `cloudflare:workers` import meets the alias above.
    server: { deps: { inline: ["crossws"] } },
  },
});
