import { writeFile } from "node:fs/promises";
import { DateTime } from "luxon";
import {
  defaultPreferences,
  type Schedule,
} from "../packages/contracts/src/index.js";
import { generate } from "../apps/api/src/workflow.js";
import { closePlaceCache } from "../apps/api/src/places.js";
const model = process.env.OLLAMA_MODEL || "gemma4:e2b";
const now = new Date().toISOString();
const date = DateTime.fromISO(now)
  .setZone("Australia/Melbourne")
  .plus({ weeks: 1 })
  .startOf("week")
  .toISODate()!;
const p = { ...defaultPreferences(), version: 1 };
const schedule: Schedule = {
  weekStart: date,
  timezone: p.timezone,
  version: 1,
  confirmedAt: now,
  confirmedDays: [0, 1, 2, 3, 4, 5, 6],
  windows: Array.from({ length: 7 }, (_, day) => ({
    day,
    start: "09:00",
    end: "19:00",
  })),
  blocks: Array.from({ length: 5 }, (_, day) => ({
    id: `work-${day}`,
    day,
    start: "09:00",
    end: "17:00",
    nextDay: false,
    kind: "work" as const,
    ...(day === 1 ? { lunch: { start: "12:00", end: "12:30" } } : {}),
  })),
};
const base = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
// /api/tags is local-only administration and is intentionally unavailable through the deployment proxy.
let digest: string | undefined;
try {
  const tags = (await fetch(`${base}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.json())) as { models: { name: string; digest: string }[] };
  digest = tags.models.find((m) => m.name === model)?.digest;
} catch {}
const results = [];
for (const [name, s, prefs] of [
  ["work-and-lunch", schedule, p],
  [
    "nearby-parks",
    schedule,
    {
      ...p,
      latitude: -37.81,
      longitude: 144.96,
      travelMinutes: 10,
    },
  ],
  [
    "longer-outing-with-forecast",
    schedule,
    { ...p, longerOuting: true, latitude: -37.81, longitude: 144.96 },
  ],
  ["no-availability", { ...schedule, windows: [] }, p],
  [
    "no-garden-access",
    schedule,
    { ...p, interests: ["garden"] as const, garden: false },
  ],
] as const) {
  const start = performance.now();
  const result = await generate({
    schedule: { ...s, windows: [...s.windows] },
    preferences: { ...prefs, interests: [...prefs.interests] },
    existing: [],
    now,
  });
  const row = {
    name,
    source: result.source,
    attempts: result.attempts,
    latencyMs: Math.round(performance.now() - start),
    activities: result.activities.map((a) => ({
      category: a.category,
      long: a.long,
      destination: a.destination?.name ?? null,
      activityMinutes: a.activityMinutes,
      totalMinutes: a.totalMinutes,
      start: a.start,
      end: a.end,
    })),
    notice: result.notice,
  };
  results.push(row);
  console.log(JSON.stringify(row));
}
const eligible = results.filter((r) => r.attempts > 0);
const report = {
  recordedAt: new Date().toISOString(),
  model,
  digest: digest ?? "Unavailable: record on the inference host",
  sampleSize: results.length,
  inferenceCases: eligible.length,
  rejectedAttempts: eligible.reduce(
    (sum, r) => sum + r.attempts - (r.source === "gemma" ? 1 : 0),
    0,
  ),
  liveSuccesses: eligible.filter((r) => r.source === "gemma").length,
  fallbacks: eligible.filter((r) => r.source === "basic").length,
  repairAttempts: eligible.filter((r) => r.attempts > 1).length,
  results,
};
await writeFile(
  new URL("./results.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
await closePlaceCache();
