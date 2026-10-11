import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { MongoStore, mutate } from "../apps/api/src/store.js";

// Opt-in local test setup. Copies the existing test schedule into the next
// complete week and queues a fresh generation through the normal worker.
const store = new MongoStore(
  process.env.MONGODB_URI!,
  process.env.MONGODB_DB || "outsideweek",
);
await store.open();
try {
  const sourceWeek = DateTime.now().setZone("Australia/Melbourne").startOf("week")
    .toISODate()!;
  const targetWeek = DateTime.fromISO(sourceWeek).plus({ weeks: 1 }).toISODate()!;
  const matches = [];
  for (const id of await store.ids()) {
    const state = await store.get(id);
    if (state?.schedules[sourceWeek]) matches.push(id);
  }
  if (matches.length !== 1)
    throw new Error(`Expected one scheduled local test profile; found ${matches.length}.`);
  const result = await mutate(store, matches[0], (state) => {
    const source = state.schedules[sourceWeek];
    state.preferences = {
      ...state.preferences,
      area: "Melbourne CBD (sample emulator location)",
      latitude: -37.81,
      longitude: 144.96,
      interests: ["walk", "park", "garden", "photography", "reading", "exercise", "picnic", "hiking"],
      intensity: "moderate",
      longMinutes: 180,
      daysPerWeek: 7,
      longerOuting: true,
      transport: "car",
      travelMinutes: 15,
      hikeDriveMinutes: 180,
      garden: true,
      reminders: false,
      version: state.preferences.version + 1,
    };
    state.schedules[targetWeek] = {
      ...source,
      weekStart: targetWeek,
      timezone: state.preferences.timezone,
      version: (state.schedules[targetWeek]?.version ?? 0) + 1,
      confirmedAt: new Date().toISOString(),
    };
    delete state.plans[targetWeek];
    state.runs = state.runs.filter((run) => run.weekStart !== targetWeek);
    const run = {
      id: randomUUID(),
      weekStart: targetWeek,
      inputKey: `${state.schedules[targetWeek].version}:${state.preferences.version}:0`,
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
