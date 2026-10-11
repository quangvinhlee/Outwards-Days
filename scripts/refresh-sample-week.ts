import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { MongoStore, mutate } from "../apps/api/src/store.js";

// Opt-in local sample refresh. Leaves preferences, schedules, and outcomes intact.
const store = new MongoStore(
  process.env.MONGODB_URI!,
  process.env.MONGODB_DB || "outsideweek",
);
await store.open();
try {
  const targetWeek = DateTime.now()
    .setZone("Australia/Melbourne")
    .startOf("week")
    .plus({ weeks: 1 })
    .toISODate()!;
  const matches = [];
  for (const id of await store.ids()) {
    const state = await store.get(id);
    if (state?.schedules[targetWeek]?.confirmedAt && state.plans[targetWeek])
      matches.push(id);
  }
  if (matches.length !== 1)
    throw new Error(`Expected one planned local sample week; found ${matches.length}.`);
  const result = await mutate(store, matches[0], (state) => {
    const plan = state.plans[targetWeek];
    if (plan.activities.some((a) => a.state !== "suggested"))
      throw new Error("Sample week contains accepted or recorded activities; refresh it in the app instead.");
    const active = state.runs.find((r) =>
      r.weekStart === targetWeek && ["queued", "running"].includes(r.status));
    if (active) return { weekStart: targetWeek, runId: active.id };
    const run = {
      id: randomUUID(),
      weekStart: targetWeek,
      inputKey: `${state.schedules[targetWeek].version}:${state.preferences.version}:${plan.revision}`,
      status: "queued" as const,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    state.runs.push(run);
    return { weekStart: targetWeek, runId: run.id };
  });
  console.log(JSON.stringify(result));
} finally {
  await store.close();
}
