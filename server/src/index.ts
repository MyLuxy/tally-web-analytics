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

// Build the fully wired app without binding a port, so tests can drive it with
// app.inject() and main() can just open the db and listen.
export async function buildApp(opts: { logger?: FastifyServerOptions["logger"] } = {}) {
  const app = Fastify({
    // trustProxy lets req.ip resolve correctly behind a reverse proxy in prod
    trustProxy: true,
    logger: opts.logger ?? false,
  });

  // The collect endpoint is hit from any site embedding the tracker, so it has
  // to be wide open. It only ever writes, never reads anything back, so this is
  // safe. The stats API would get locked down per-site once there's auth.
  await app.register(cors, { origin: true });

  // The built dashboard lives in web-dist (vite outputs there). When it's
  // present we serve everything from one origin in prod; in dev it's missing
  // and the dashboard runs off the vite server on :5173 instead.
  const webDist = join(here, "..", "web-dist");
  const roots = [join(here, "..", "public")];
  if (existsSync(webDist)) roots.unshift(webDist);

  await app.register(staticFiles, {
    root: roots, // looked up in order: dashboard first, then tracker/demo
    prefix: "/",
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(collectRoutes);
  await app.register(statsRoutes);

  // SPA fallback: anything that isn't an API call or a real file gets index.html
  // so client-side routes resolve. Only makes sense once the dashboard is built.
  if (existsSync(join(webDist, "index.html"))) {
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      reply.code(404).send({ error: "not found" });
    });
  }

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
