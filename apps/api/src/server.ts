import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { FileStore, MongoStore } from "./store.js";
import { closePlaceCache } from "./places.js";
if (process.env.NODE_ENV === "production" && !process.env.MONGODB_URI)
  throw new Error("MONGODB_URI is required in production.");
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.OLLAMA_SERVICE_TOKEN ||
    !process.env.OLLAMA_BASE_URL?.startsWith("https://"))
)
  throw new Error("Production inference requires authenticated HTTPS.");
const store = process.env.MONGODB_URI
  ? new MongoStore(
      process.env.MONGODB_URI,
      process.env.MONGODB_DB || "outsideweek",
    )
  : new FileStore(resolve(process.env.DATA_DIRECTORY || "../../.data"));
await store.open();
const { app, tick } = await buildApp(store, { logger: true });
const timer = setInterval(
  () => void tick().catch(() => app.log.error("Job runner iteration failed")),
  1500,
);
app.addHook("onClose", async () => {
  clearInterval(timer);
  await Promise.all([store.close(), closePlaceCache()]);
});
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 3000) });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void app.close());
