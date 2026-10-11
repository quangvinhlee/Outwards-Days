import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const value = process.env.EXPO_PUBLIC_WEB_API_BASE_URL;
if (!value) {
  console.error("Set EXPO_PUBLIC_WEB_API_BASE_URL to the deployed HTTPS API URL before building the website.");
  process.exit(1);
}
let url;
try {
  url = new URL(value);
} catch {
  console.error("EXPO_PUBLIC_WEB_API_BASE_URL must be a valid HTTPS URL.");
  process.exit(1);
}
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
  console.error("Use an HTTPS API origin with no credentials, path, query or fragment.");
  process.exit(1);
}
const result = spawnSync("pnpm", ["--filter", "@outsideweek/mobile", "exec", "expo", "export", "--platform", "web", "--clear", "--output-dir", "dist"], {
  stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_WEB_API_BASE_URL: url.origin },
});
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status ?? 1);
const directory = fileURLToPath(new URL("../apps/mobile/dist/_expo/static/js/web/", import.meta.url));
const configured = readdirSync(directory).filter((name) => name.endsWith(".js"))
  .some((name) => readFileSync(`${directory}/${name}`, "utf8").includes(url.origin));
if (!configured) {
  console.error("The exported JavaScript does not contain the configured API origin. Do not publish this build.");
  process.exit(1);
}
console.log("Verified the hosted API origin is included in the web bundle.");
