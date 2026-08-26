import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import type { FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import { openDb } from "./db.js";
import { collectRoutes } from "./routes/collect.js";
import { statsRoutes } from "./routes/stats.js";

const here = dirname(fileURLToPath(import.meta.url));

// separate from main() so tests can inject() against it without binding a port
export async function buildApp(opts: { logger?: FastifyServerOptions["logger"] } = {}) {
  const app = Fastify({
    trustProxy: true, // behind a proxy in prod, need this for req.ip
    logger: opts.logger ?? false,
  });

  await app.register(cors, { origin: true });

  // sendBeacon sends text/plain to dodge cors preflight, so we gotta parse it ourselves
  app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch {
      done(null, {});
    }
  });

  const webDist = join(here, "..", "web-dist");
  const roots = [join(here, "..", "public")];
  if (existsSync(webDist)) roots.unshift(webDist); // dashboard build, missing in dev

  // set TALLY_BASE_PATH if this is mounted under a sub-path (e.g /analytics) instead of
  // its own domain, has to match vite's `base` too, see web/vite.config.ts
  const basePath = process.env.TALLY_BASE_PATH ?? "";

  await app.register(
    async (instance) => {
      await instance.register(staticFiles, {
        root: roots,
        prefix: "/",
      });

      instance.get("/health", async () => ({ ok: true }));

      await instance.register(collectRoutes);
      await instance.register(statsRoutes);

      // spa fallback, only if the dashboard's actually built
      if (existsSync(join(webDist, "index.html"))) {
        instance.setNotFoundHandler((req, reply) => {
          if (req.method === "GET" && !req.url.startsWith(`${basePath}/api`)) {
            return reply.sendFile("index.html");
          }
          reply.code(404).send({ error: "not found" });
        });
      }
    },
    { prefix: basePath },
  );

  return app;
}

async function main() {
  openDb(); // fail fast if the db can't be opened
  const app = await buildApp({ logger: { transport: { target: "pino-pretty" } } });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

// Don't boot the server when the module is imported by a test.
if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
