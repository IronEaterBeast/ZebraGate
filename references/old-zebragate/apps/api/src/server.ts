import { buildApp } from "./app.js";
import { getEnv } from "./config/env.js";

async function startServer(): Promise<void> {
  const env = getEnv();
  const app = await buildApp();

  try {
    await app.listen({ host: env.host, port: env.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void startServer();
