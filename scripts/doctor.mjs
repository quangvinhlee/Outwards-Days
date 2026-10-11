import { MongoClient } from "mongodb";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
let failed = false;
async function check(label, fn) {
  try {
    console.log(`OK  ${label}: ${await fn()}`);
  } catch (e) {
    failed = true;
    console.log(
      `FAIL ${label}: ${e.name === "MongoServerSelectionError" ? "database unreachable" : e.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/g, "[database URL hidden]")}`,
    );
  }
}
await check("MongoDB", async () => {
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "outsideweek");
    await db.command({ ping: 1 });
    await db
      .collection("setupChecks")
      .updateOne(
        { id: "local-ready" },
        { $set: { checkedAt: new Date() } },
        { upsert: true },
      );
    const found = await db
      .collection("setupChecks")
      .findOne({ id: "local-ready" });
    if (!found) throw new Error("read-after-write failed");
    await db.collection("setupChecks").deleteOne({ id: "local-ready" });
    return "authenticated read/write verified";
  } finally {
    await client.close();
  }
});
await check("Ollama", async () => {
  const res = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const model = data.models.find((m) => m.name === process.env.OLLAMA_MODEL);
  if (!model) throw new Error("configured model is not downloaded");
  return `${model.name}, digest ${model.digest.slice(0, 12)}`;
});
await check("API", async () => {
  const res = await fetch(
    `http://127.0.0.1:${process.env.PORT || 3100}/healthz`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return "healthy";
});
await check("Mobile env", async () => {
  const config = parseEnv(
    await readFile(new URL("../apps/mobile/.env", import.meta.url), "utf8"),
  );
  if (!config.EXPO_PUBLIC_API_BASE_URL)
    throw new Error("public API URL missing");
  return config.EXPO_PUBLIC_API_BASE_URL;
});
console.log(
  process.env.SERPAPI_API_KEY
    ? "Optional SerpApi key is configured (not displayed)."
    : "Optional SerpApi is disabled; familiar-location activities remain available.",
);
process.exitCode = failed ? 1 : 0;
