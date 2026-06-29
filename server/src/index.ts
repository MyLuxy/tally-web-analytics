import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import { openDb } from "./db.js";
import { collectRoutes } from "./routes/collect.js";
import { statsRoutes } from "./routes/stats.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  openDb(); // fail fast if the db can't be opened

  const app = Fastify({
    // trustProxy lets req.ip resolve correctly behind a reverse proxy in prod
    trustProxy: true,
    logger: { transport: { target: "pino-pretty" } },
  });

  // The collect endpoint is hit from any site embedding the tracker, so it has
  // to be wide open. It only ever writes, never reads anything back, so this is
  // safe. The stats API would get locked down per-site once there's auth.
  await app.register(cors, { origin: true });

  // serve the tracker script + demo page from /public at the web root
  await app.register(staticFiles, {
    root: join(here, "..", "public"),
    prefix: "/",
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(collectRoutes);
  await app.register(statsRoutes);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
