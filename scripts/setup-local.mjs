import { randomBytes } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
async function existing(path) {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return "";
    throw e;
  }
}
const path = ".env";
let text = await existing(path);
const values = parseEnv(text);
function ensure(key, value) {
  if (values[key]) return values[key];
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text)
    ? text.replace(re, line)
    : `${text.trimEnd()}\n${line}\n`;
  values[key] = value;
  return value;
}
ensure("NODE_ENV", "development");
ensure("PORT", "3100");
ensure("MONGO_PORT", "27019");
ensure("MONGO_ROOT_USERNAME", "outsideweek_admin");
ensure("MONGO_ROOT_PASSWORD", randomBytes(32).toString("hex"));
ensure("MONGO_APP_PASSWORD", randomBytes(32).toString("hex"));
ensure("MONGODB_DB", "outsideweek");
ensure(
  "MONGODB_URI",
  `mongodb://outsideweek:${values.MONGO_APP_PASSWORD}@127.0.0.1:${values.MONGO_PORT}/outsideweek?authSource=outsideweek`,
);
ensure("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
ensure("OLLAMA_MODEL", "gemma4:e2b");
ensure("INFERENCE_TIMEOUT_MS", "90000");
ensure("SESSION_TTL_DAYS", "30");
ensure("WEATHER_BASE_URL", "https://api.open-meteo.com");
if (!("SERPAPI_API_KEY" in values))
  text +=
    "\n# Optional: paste a SerpApi key here to enable destination discovery.\nSERPAPI_API_KEY=\n";
if (!("OLLAMA_SERVICE_TOKEN" in values))
  text +=
    "\n# Needed only for a remote authenticated inference proxy.\nOLLAMA_SERVICE_TOKEN=\n";
await writeFile(path, text.trimStart(), { mode: 0o600 });
await chmod(path, 0o600);
const lan = Object.entries(networkInterfaces())
  .filter(([name]) => !/^(docker|br-|veth|tailscale|lo)/.test(name))
  .flatMap(([, addresses]) => addresses ?? [])
  .find((a) => a.family === "IPv4" && !a.internal)?.address;
const host = process.argv.includes("--emulator")
  ? "10.0.2.2"
  : lan || "127.0.0.1";
const mobilePath = "apps/mobile/.env";
const mobile = await existing(mobilePath);
if (!mobile.trim())
  await writeFile(
    mobilePath,
    `# Public API URL only. Never put provider keys in this file.\nEXPO_PUBLIC_API_BASE_URL=http://${host}:${values.PORT}\n`,
    { mode: 0o600 },
  );
await chmod(mobilePath, 0o600);
console.log(
  "Local environment files ready; existing non-empty values preserved. Passwords are not printed.",
);
const result = spawnSync(
  "docker",
  ["compose", "up", "-d", "--wait", "mongodb"],
  { cwd: root, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const migration = spawnSync(
  process.execPath,
  ["--env-file=.env", "scripts/migrate-local.mjs"],
  { cwd: root, stdio: "inherit" },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
console.log(
  `Database is ready. Run pnpm dev:api, then pnpm dev:mobile. API port: ${values.PORT}.`,
);
